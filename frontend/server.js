const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files from the public directory
app.use(express.static('public'));

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎨 Tourism Agent Frontend Server`);
  console.log(`📍 Running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`✅ Frontend ready!\n`);
});