import React, { useState } from 'react';
import './App.css';

function App() {
  const [bubbles, setBubbles] = useState([]);
  const [input, setInput] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() === "") return;

    const newBubble = {
      text: input,
      id: Date.now(),
    };

    setBubbles([...bubbles, newBubble]);
    setInput("");
  };

  return (
    <div className="App">
      <div className="bubble-container">
        {bubbles.map((bubble, index) => {
          // Calculate position
          const angle = (index / bubbles.length) * 360;
          const radius = 100 + index * 20; // Adjust radius increment as needed
          const style = {
            transform: `rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`,
          };

          return (
            <div key={bubble.id} className="bubble" style={style}>
              {bubble.text}
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type something..."
        />
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}

export default App;