var values = {
  distance: 0,
  speed: 0,
  brake: 0
};

const path = require('path');
const express = require('express');
const app = require('express')();
const http = require('http').Server(app);
const socket = require('socket.io')(http);

app.use(express.static(path.join(__dirname, "public")));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/index.html'));
  console.log('Done sending index.html');
});

socket.on('connection', s => {
  setInterval(() => s.emit('messageobject', values), 200);
  console.log('Done establishing  I/O connection and sent message');
  s.on('returnedmessageobj', m => {
    console.log(m);
  });
});

let port = 8080;
http.listen(port, () => console.log('listening on ', port));


/************************************************/


const {Board, Proximity} = require("johnny-five");
const five = require("johnny-five");
var board = new Board({
  repl: false
}); 

board.on("ready", () => {
  const proximity = new Proximity({
    controller: "HCSR04",
    pin: 9
  });

  var pedal_gas = new five.Pin('A2');
  setInterval(() => {
    pedal_gas.query(function(state) {
      values.speed = state.value;
    });
  }, 200);

  var pedal_brake = new five.Pin('A3');
  setInterval(() => {
    pedal_brake.query(function(state) {
      values.brake = state.value;
    });
  }, 200);

  //Vibration
  setInterval(() => {
    if (values.speed > 800) {
      board.digitalWrite(13, 1);
    } else {
      board.digitalWrite(13, 0);
    }
  }, 50);

  proximity.on("change", () => {
    const {centimeters, inches} = proximity;
    values.distance = centimeters;
  });
});

