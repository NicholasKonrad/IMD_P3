// import { Socket } from "socket.io.js";

var video_pbr = document.getElementById('video').playbackRate = 1;
//Chrome & Firefox  0.0625 - 16.0
const MIN_PLAYBACKRATE = 0.0625;
const MAX_PLAYBACKRATE = 16.0;
var inoData = {};
const intervalSize = 500;

/*
  remap intervals
  [A, B] --> [a, b]
  (val - A)*(b-a)/(B-A) + a
*/

//200 = MAX DISTANCE [cm] for ultrasonic sensor

function getCoefficient_Pot(val) {
  return val / 1024;
}

function updateVideoPBR() {
  //http://fooplot.com/#W3sidHlwZSI6MCwiZXEiOiIwLjA2MjUtMTYoeC0xKSIsImNvbG9yIjoiIzAwMDAwMCJ9LHsidHlwZSI6MTAwMCwid2luZG93IjpbIi0xNi41NzEyMDAwMDAwMDAwMDUiLCIxNi43MDg4MDAwMDAwMDAwMDQiLCItMy44NTAzOTk5OTk5OTk5OTkiLCIxNi42Mjk2MDAwMDAwMDAwMDMiXX1d
  //f(x) = 0.0625 - 16(x-1)  |  x € [0;1]
  if ((inoData.distance/200) > MAX_PLAYBACKRATE) video_pbr = MAX_PLAYBACKRATE;
  else if ((inoData.distance/200) < MIN_PLAYBACKRATE) video_pbr = MIN_PLAYBACKRATE;
  else video_pbr = parseFloat((inoData.distance/200)*16);
}

var socket = io();
console.log(socket);
socket.on('connect', () => { 
  console.log('I think the server just connected to the client');
});
socket.on('messageobject', (message) => { 
  socket.emit('returnedmessageobj', message);
  inoData = message;
});

setInterval(() => {
  updateVideoPBR();
  console.log(video_pbr);  
}, 50);