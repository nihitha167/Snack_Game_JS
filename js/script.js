// Select DOM elements for replay button and score display
let dom_replay = document.querySelector("#restart");
let dom_score = document.querySelector("#score");

// Create and append a canvas element for rendering the game
let dom_canvas = document.createElement("canvas");
document.querySelector("#canvas").appendChild(dom_canvas);
let CTX = dom_canvas.getContext("2d");

// Set canvas dimensions
const W = (dom_canvas.width = 500);
const H = (dom_canvas.height = 500);

// Game variables
let snake,
  food,
  currentHue,
  cells = 20, // Number of cells in the grid
  cellSize,
  isGameOver = false, // Flag to track game state
  tails = [],
  score = 0,
  maxScore = window.localStorage.getItem("maxScore") || undefined, // Retrieve max score from local storage
  particles = [],
  splashingParticleCount = 20, // Number of particles for splash effect
  cellsCount,
  requestID; // For requestAnimationFrame control

// Helper functions and classes
let helpers = {
  // Vector class for handling positions and directions
  Vec: class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    add(v) {
      this.x += v.x;
      this.y += v.y;
      return this;
    }
    mult(v) {
      // Multiplies the vector by another vector or a scalar
      if (v instanceof helpers.Vec) {
        this.x *= v.x;
        this.y *= v.y;
        return this;
      } else {
        this.x *= v;
        this.y *= v;
        return this;
      }
    }
  },
  // Check for collision between two vectors
  isCollision(v1, v2) {
    return v1.x == v2.x && v1.y == v2.y;
  },
  // Garbage collector for particles
  garbageCollector() {
    for (let i = 0; i < particles.length; i++) {
      if (particles[i].size <= 0) {
        particles.splice(i, 1); // Remove dead particles
      }
    }
  },
  // Draw the grid on the canvas
  drawGrid() {
    CTX.lineWidth = 1.1;
    CTX.strokeStyle = "#181825";
    CTX.shadowBlur = 0;
    for (let i = 1; i < cells; i++) {
      let f = (W / cells) * i;
      CTX.beginPath();
      CTX.moveTo(f, 0);
      CTX.lineTo(f, H);
      CTX.stroke();
      CTX.beginPath();
      CTX.moveTo(0, f);
      CTX.lineTo(W, f);
      CTX.stroke();
      CTX.closePath();
    }
  },
  // Generate a random hue for colors
  randHue() {
    return ~~(Math.random() * 360);
  },
  // Convert HSL color to RGB
  hsl2rgb(hue, saturation, lightness) {
    if (hue == undefined) {
      return [0, 0, 0]; // Return black if no hue
    }
    var chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    var huePrime = hue / 60;
    var secondComponent = chroma * (1 - Math.abs((huePrime % 2) - 1));
    huePrime = ~~huePrime;
    var red, green, blue;
    
    // Determine RGB values based on hue
    if (huePrime === 0) {
      red = chroma;
      green = secondComponent;
      blue = 0;
    } else if (huePrime === 1) {
      red = secondComponent;
      green = chroma;
      blue = 0;
    } else if (huePrime === 2) {
      red = 0;
      green = chroma;
      blue = secondComponent;
    } else if (huePrime === 3) {
      red = 0;
      green = secondComponent;
      blue = chroma;
    } else if (huePrime === 4) {
      red = secondComponent;
      green = 0;
      blue = chroma;
    } else if (huePrime === 5) {
      red = chroma;
      green = 0;
      blue = secondComponent;
    }
    
    // Adjust lightness
    var lightnessAdjustment = lightness - chroma / 2;
    red += lightnessAdjustment;
    green += lightnessAdjustment;
    blue += lightnessAdjustment;
    
    return [
      Math.round(red * 255),
      Math.round(green * 255),
      Math.round(blue * 255)
    ];
  },
  // Linear interpolation between two values
  lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }
};

// Key control management
let KEY = {
  ArrowUp: false,
  ArrowRight: false,
  ArrowDown: false,
  ArrowLeft: false,
  // Reset key states
  resetState() {
    this.ArrowUp = false;
    this.ArrowRight = false;
    this.ArrowDown = false;
    this.ArrowLeft = false;
  },
  // Listen for keydown events
  listen() {
    addEventListener(
      "keydown",
      (e) => {
        // Prevent reversing direction
        if (e.key === "ArrowUp" && this.ArrowDown) return;
        if (e.key === "ArrowDown" && this.ArrowUp) return;
        if (e.key === "ArrowLeft" && this.ArrowRight) return;
        if (e.key === "ArrowRight" && this.ArrowLeft) return;

        this[e.key] = true; // Set the key state to true
        Object.keys(this)
          .filter((f) => f !== e.key && f !== "listen" && f !== "resetState")
          .forEach((k) => {
            this[k] = false; // Reset other key states
          });
      },
      false
    );
  }
};

// Snake class to manage snake behavior
class Snake {
  constructor(i, type) {
    this.pos = new helpers.Vec(W / 2, H / 2); // Initial position
    this.dir = new helpers.Vec(0, 0); // Initial direction
    this.type = type;
    this.index = i;
    this.delay = 7; // Delay for movement updates
    this.size = W / cells; // Size of each snake segment
    this.color = "lightgreen"; // Color of the snake
    this.history = []; // History of positions for the snake's body
    this.total = 1; // Total segments of the snake
  }
  
  // Draw the snake on the canvas
  draw() {
    let { x, y } = this.pos;
    CTX.fillStyle = this.color;
    CTX.shadowBlur = 20; // Shadow for a glowing effect
    CTX.shadowColor = "rgba(255,255,255,.3 )";
    CTX.fillRect(x, y, this.size, this.size); // Draw the head
    CTX.shadowBlur = 0;

    // Draw the body segments
    if (this.total >= 2) {
      for (let i = 0; i < this.history.length - 1; i++) {
        let { x, y } = this.history[i];
        CTX.lineWidth = 1;
        CTX.fillStyle = "lightgreen";
        CTX.fillRect(x, y, this.size, this.size);
        CTX.strokeStyle = "black"; 
        CTX.strokeRect(x, y, this.size, this.size); 
      }
    }
  }
  
  // Handle snake wall collisions (wrap around)
  walls() {
    let { x, y } = this.pos;
    if (x + cellSize > W) {
      this.pos.x = 0; // Wrap to the left
    }
    if (y + cellSize > H) {
      this.pos.y = 0; // Wrap to the top
    }
    if (y < 0) {
      this.pos.y = H - cellSize; // Wrap to the bottom
    }
    if (x < 0) {
      this.pos.x = W - cellSize; // Wrap to the right
    }
  }
  
  // Handle snake controls
  controlls() {
    let dir = this.size; // Movement distance
    if (KEY.ArrowUp) {
      this.dir = new helpers.Vec(0, -dir); // Move up
    }
    if (KEY.ArrowDown) {
      this.dir = new helpers.Vec(0, dir); // Move down
    }
    if (KEY.ArrowLeft) {
      this.dir = new helpers.Vec(-dir, 0); // Move left
    }
    if (KEY.ArrowRight) {
      this.dir = new helpers.Vec(dir, 0); // Move right
    }
  }
  
  // Check for self-collision
  selfCollision() {
    for (let i = 0; i < this.history.length; i++) {
      let p = this.history[i];
      if (helpers.isCollision(this.pos, p)) {
        isGameOver = true; // End game if colliding with itself
      }
    }
  }
  
  // Update snake position and state
  update() {
    this.walls(); // Handle wall wrapping
    this.draw(); // Draw the snake
    this.controlls(); // Check controls

    if (!this.delay--) { // Update movement based on delay
      // Check if snake eats food
      if (helpers.isCollision(this.pos, food.pos)) {
        incrementScore(); // Update score
        particleSplash(); // Create splash effect
        food.spawn(); // Spawn new food
        this.total++; // Increase size of the snake
      }

      // Update history for snake segments
      this.history[this.total - 1] = new helpers.Vec(this.pos.x, this.pos.y);
      for (let i = 0; i < this.total - 1; i++) {
        this.history[i] = this.history[i + 1]; // Shift history
      }

      // Move the snake
      this.pos.add(this.dir);
      this.delay = 7; // Reset delay

      // Check for self-collision only if snake has more than 3 segments
      this.total > 3 ? this.selfCollision() : null;
    }
  }
}

// Food class to manage food behavior
class Food {
  constructor() {
    // Spawn food at a random position within the grid
    this.pos = new helpers.Vec(
      ~~(Math.random() * cells) * cellSize,
      ~~(Math.random() * cells) * cellSize
    );
    this.color = "red"; // Food color
    this.size = cellSize; // Food size
  }

  // Draw the food on the canvas
  draw() {
    let { x, y } = this.pos;
    CTX.globalCompositeOperation = "lighter"; // Blend mode
    CTX.shadowColor = this.color;
    CTX.fillStyle = this.color;
    CTX.beginPath();
    CTX.arc(x + this.size / 2, y + this.size / 2, this.size / 2, 0, Math.PI * 2); // Draw food as a circle
    CTX.fill();
    CTX.globalCompositeOperation = "source-over"; // Reset blend mode
    CTX.shadowBlur = 0;
  }

  // Spawn food at a new position
  spawn() {
    let randX = ~~(Math.random() * cells) * this.size;
    let randY = ~~(Math.random() * cells) * this.size;

    // Ensure food does not spawn on the snake
    for (let path of snake.history) {
      if (helpers.isCollision(new helpers.Vec(randX, randY), path)) {
        return this.spawn(); // Re-spawn if colliding
      }
    }
    this.color = "red"; // Set food color
    this.pos = new helpers.Vec(randX, randY); // Update food position
  }
}

// Particle class for visual effects
class Particle {
  constructor(pos, color, size, vel) {
    this.pos = pos; // Particle position
    this.color = color; // Particle color
    this.size = Math.abs(size / 2); // Particle size
    this.ttl = 0; // Time to live for particle
    this.gravity = -0.2; // Gravity effect
    this.vel = vel; // Particle velocity
  }

  // Draw the particle on the canvas
  draw() {
    let { x, y } = this.pos;
    let hsl = this.color
      .split("")
      .filter((l) => l.match(/[^hsl()$% ]/g))
      .join("")
      .split(",")
      .map((n) => +n);
    let [r, g, b] = helpers.hsl2rgb(hsl[0], hsl[1] / 100, hsl[2] / 100);
    CTX.shadowColor = "white";
    CTX.shadowBlur = 0;
    CTX.globalCompositeOperation = "lighter";
    CTX.fillStyle = "white"; // Set fill color
    CTX.fillRect(x, y, this.size, this.size); // Draw particle
    CTX.globalCompositeOperation = "source-over"; // Reset blend mode
  }

  // Update particle state
  update() {
    this.draw(); // Draw particle
    this.size -= 0.3; // Decrease size over time
    this.ttl += 1; // Increment time to live
    this.pos.add(this.vel); // Update position
    this.vel.y -= this.gravity; // Apply gravity to velocity
  }
}

// Increment the score and update the display
function incrementScore() {
  score++;
  dom_score.innerText = score.toString().padStart(2, "0");
}

// Create a splash effect when food is eaten
function particleSplash() {
  for (let i = 0; i < splashingParticleCount; i++) {
    let vel = new helpers.Vec(Math.random() * 6 - 3, Math.random() * 6 - 3); // Random velocity
    let position = new helpers.Vec(food.pos.x, food.pos.y); // Position at food's location
    particles.push(new Particle(position, "", food.size, vel)); // Add new particle
  }
}

// Clear the canvas
function clear() {
  CTX.clearRect(0, 0, W, H);
}

// Initialize the game
function initialize() {
  alert("Welcome to the Snake Game! Press an arrow key to start the game.");
  CTX.imageSmoothingEnabled = false; // Disable image smoothing
  KEY.listen(); // Start listening for key events
  cellsCount = cells * cells; // Total cells
  cellSize = W / cells; // Size of each cell
  snake = new Snake(); // Create a new snake instance
  food = new Food(); // Create a new food instance
  dom_replay.addEventListener("click", reset, false); // Add event listener for replay
  loop(); // Start the game loop
}

// Main game loop
function loop() {
  clear(); // Clear the canvas
  if (!isGameOver) {
    requestID = requestAnimationFrame(loop); // Request next frame
    helpers.drawGrid(); // Draw the grid
    snake.update(); // Update the snake
    food.draw(); // Draw the food
    for (let p of particles) {
      p.update(); // Update each particle
    }
    helpers.garbageCollector(); // Clean up dead particles
  } else {
    clear(); // Clear canvas if game is over
    gameOver(); // Show game over screen
  }
}

// Display game over screen
function gameOver() {
  maxScore ? null : (maxScore = score); // If no max score, set it to current score
  score > maxScore ? (maxScore = score) : null; // Update max score if current score is higher
  window.localStorage.setItem("maxScore", maxScore); // Save max score to local storage
  CTX.fillStyle = "#4cffd7"; // Set text color
  CTX.textAlign = "center"; // Center align text
  CTX.font = "bold 30px Poppins, sans-serif"; // Set font for game over message
  CTX.fillText("GAME OVER", W / 2, H / 2); // Display game over message
  CTX.font = "15px Poppins, sans-serif"; // Set font for score display
  CTX.fillText(`SCORE   ${score}`, W / 2, H / 2 + 60); // Display current score
  CTX.fillText(`MAXSCORE   ${maxScore}`, W / 2, H / 2 + 80); // Display max score
}

// Reset the game state
function reset() {
  dom_score.innerText = "00"; // Reset score display
  score = "00"; // Reset score variable
  snake = new Snake(); // Create a new snake instance
  food.spawn(); // Spawn new food
  KEY.resetState(); // Reset key states
  isGameOver = false; // Reset game over flag
  cancelAnimationFrame(requestID); // Cancel the current animation frame
  loop(); // Start the game loop again
}

// Start the game
initialize();
