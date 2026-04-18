const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { getLogisticsPlan } = require('./services/aiService');
const { updateRoadStatus } = require('./services/graphService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
  console.log('C2 Operator Connected');

  socket.on('P2_INCIDENT', async (data) => {
    // 1. Update Graph (Block the road)
    await updateRoadStatus(data.location, 'BLOCKED');
    
    // 2. Broadcast tactical alert
    io.emit('TACTICAL_ALERT', data);
    
    // 3. Get AI Logistics Directive
    const plan = await getLogisticsPlan(data);
    io.emit('P3_LOGISTICS_UPDATE', plan);
  });
});

server.listen(process.env.PORT, () => console.log('Aegis Engine Active'));