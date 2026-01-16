import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Live from './pages/Live';
import Stream from './pages/Stream';
import Logs from './pages/Logs';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/live" element={<Live />} />
        <Route path="/stream" element={<Stream />} />
        <Route path="/logs/:cameraName" element={<Logs />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

