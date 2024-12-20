import React, { useState } from 'react';
import './App.css';

function App() {
  const [bubbles, setBubbles] = useState([]);
  const [input, setInput] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setBubbles([...bubbles, input]);
    setInput("");
  };

  return (
    <div className="App">
      <div className="bubble-container">
        {bubbles.map((bubble, index) => (
          <div key={index} className="bubble">{bubble}</div>
        ))}
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