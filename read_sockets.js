const path = require("path");
const express = require("express");
const app = require("express")();
const http = require("http").Server(app);
const socket = require("socket.io")(http);
const { Board, Proximity } = require("johnny-five");
const five = require("johnny-five");

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/index.html"));
});

socket.on("connection", s => {
  setInterval(() => s.emit("messageobject", data), 50);
  setInterval(() => s.emit("inoData", inoData), 50);
  setInterval(() => s.emit("logObject", logObject), 50);
  console.log("Server side connection available");
  s.on("returnedmessageobj", m => {
    // console.log(m);
  });
});

let port = 8080;
http.listen(port, () => console.log("listening on ", port));

/************************************************/

const INTERVALFREQ = 100;
const MAX_SENSORRANGE = 155; //laut datasheet 4m aber reliabel leider erst ab ~1.5m
const DETECTION_DISCRIMINATIONRANGE = 3;
const MIN_PLAYBACKRATE = 0.0625; //Chrome & Firefox
const MAX_PLAYBACKRATE = 16.0;
const MAX_SPEEDLIMITINDEX = 5;
const MAX_KMH = 140;
const MAX_LIGHTPULSERANGE = 15;
const MAX_TEXTPULSERANGE = 300;

let simulationState = 0;
let preSimulationState = 0;
let vibrationAvailable = false;

let inoData = {
  distance: 0,
  driver_manualSpeedCoeff: 0,
  // driver_manualBrake: 0
  distanceEnvelopment: [],
  animalSpeed: 0
};

let data = {
  mediaStates: {
    video_pbr: 1,
    showSpeedlimit_index: 0,
    showSpeedlimit: false,
    pinRotation: "rotate(190deg)",
    showInitialWarning: false,
    showInitialWarning_cornered: false,
    showInitialWarning: false,
    showBrakeSymbol: false,
    showCarCommSymbol: false,
    showGreenLight: false,
    showRedLight: false,
    showMediaCenterTexts: false,
    showTextSaved: false,
    showTextTime: false,
    lightPulseState: 0,
    textPulseState: 0
  },
  eventCodes: {
    playVideo: true,
    playSound: false
  },
  INTERVALFREQ
};

let logObject = {
  simulationState: simulationState,
  preSimulationState: preSimulationState,
  getDrivingSpeed_Coeff: 0,
  getDrivingSpeed_KMH: 0,
  getSpeedLimitation_Num: 0,
  getManualSpeed_Coeff: 0,
  getManualSpeed_KMH: 0
};

/**************************************************************/

var board = new five.Board({
  repl: false
});

board.on("ready", () => {
  const proximity = new Proximity({
    controller: "HCSR04",
    pin: 9
  });

  //READ ARDUINO VALUES
  const driverSpeed_slider = new five.Pin("A2");
  // const driverBrake = new five.Pin("A3");
  setInterval(() => {
    driverSpeed_slider.query(function(state) {
      inoData.driver_manualSpeedCoeff = state.value / 1024;
    });
    // driverBrake.query(function(state) {
    //   inoData.driver_manualBrake = state.value;
    // });
  }, INTERVALFREQ);
  proximity.on("change", () => {
    const { centimeters, inches } = proximity;
    // inoData.distance = parseFloat(Number.parseFloat(centimeters).toFixed(1));
    if (centimeters <= MAX_SENSORRANGE) {
      if (inoData.distanceEnvelopment.length > 10)
        inoData.distanceEnvelopment.shift();
      inoData.distanceEnvelopment.push(
        parseFloat(Number.parseFloat(centimeters).toFixed(1)) //toFixed returned einen String zurück lol
      );
      inoData.distance = parseFloat(Number.parseFloat(centimeters).toFixed(1));
    } else {
      inoData.distance = MAX_SENSORRANGE + 1;
    }

    updateAnimalSpeed();
  });

  //MAIN LOOP
  setInterval(() => {
    if (simulationState != 2 && simulationState != 3) updateDrivingSpeed();
    updateLogObject();
    updatePulseStates();

    if (simulationState <= 1) {
      if (simulationState == 0) {
        if (preSimulationState == 1 && inoData.distance < MAX_SENSORRANGE)
          showInitialWarning();
        if (animalIsApproaching()) {
          inoData.animalSpeed = updateAnimalSpeed();
          playSoundEffect();
          setTimeout(() => {
            showInitialWarning();
          }, 150);
          setTimeout(() => {
            changeSimulationStateTo(1);
          }, 2200);
        }
      }

      if (simulationState == 1) {
        showInitialWarning();
        showSpeedLimitation();
        setTimeout(() => {
          if (
            data.mediaStates.showSpeedlimit_index / MAX_SPEEDLIMITINDEX >
            inoData.driver_manualSpeedCoeff
          ) {
            changeSimulationStateTo(2);
            vibrateOnce();
          } else hideBrakeSymbol();
        }, 500);
        if (inoData.distance > MAX_SENSORRANGE * 0.5 && animalIsRemoving())
          changeSimulationStateTo(0);
      }
    }

    //State 2 = Automatic Braking
    if (simulationState == 2) {
      showInitialWarning();
      showSpeedLimitation();
      showBrakeSymbol();
      showCarCommSymbol();
      blinkWarningLights();
      // data.mediaStates.video_pbr -= 0.25;

      // if (data.mediaStates.video_pbr < 1) changeSimulationStateTo(3);
      // if (animalIsRemoving()) changeSimulationStateTo(0);

      //ursprünglicher versuch, das video in abhängigkeit zu tier- und fahrergeschwindigkeit nach und nach zu verlangsamen
      {
        showSpeedLimitation();
        vibrateOnce();
        showBrakeSymbol();
        //Start automatic Braking
        if (getDrivingSpeed_KMH() > getSpeedLimitation_Num()) {
          if (data.mediaStates.video_pbr - 0.15 < MIN_PLAYBACKRATE)
            pauseDrivingVideo();
          else {
            data.mediaStates.video_pbr -= 0.15;
          }
        }
        //driver comes to stop
        if (inoData.driver_manualSpeedCoeff == 0) pauseDrivingVideo();
        //END automatic braking
        if (data.eventCodes.playVideo == false) changeSimulationStateTo(3);
        if (inoData.distance > MAX_SENSORRANGE * 0.5 && animalIsRemoving())
          changeSimulationStateTo(0);
      }
    }

    if (simulationState == 3) {
      showRedLight();
      showInitialWarning();
      showCarCommSymbol();
      blinkWarningLights();
      showWaitingTexts();

      if (inoData.distance > MAX_SENSORRANGE * 0.5 && animalIsRemoving())
        changeSimulationStateTo(4);
    }

    if (simulationState == 4) {
      playSoundEffect();
      if (getManualSpeed_KMH() < 30) {
        showGreenLight();
        showCarCommSymbol();
        updatePulseStates();
      }
      setTimeout(() => {
        changeSimulationStateTo(0);
      }, 10000);
    }
  }, INTERVALFREQ);
});

/**********************************************************/

function updateLogObject() {
  logObject.simulationState = simulationState;
  logObject.preSimulationState = preSimulationState;
  logObject.getDrivingSpeed_Coeff = getDrivingSpeed_Coeff();
  logObject.getDrivingSpeed_KMH = getDrivingSpeed_KMH(9);
  logObject.getSpeedLimitation_Num = getSpeedLimitation_Num();
  logObject.getManualSpeed_KMH = getManualSpeed_KMH();
  logObject.getManualSpeed_Coeff = getManualSpeed_Coeff();
}

function getManualSpeed_Coeff() {
  return inoData.driver_manualSpeedCoeff;
}
function getManualSpeed_KMH() {
  return getManualSpeed_Coeff() * MAX_KMH;
}

function getDrivingSpeed_Coeff() {
  if (data.eventCodes.playVideo == false) return 0;
  return data.mediaStates.video_pbr / MAX_PLAYBACKRATE;
}
function getDrivingSpeed_KMH() {
  return getDrivingSpeed_Coeff() * MAX_KMH;
}

function getSpeedLimitation_Index() {
  if (MAX_SENSORRANGE / inoData.distance <= MAX_SPEEDLIMITINDEX)
    return Math.round(MAX_SENSORRANGE / inoData.distance);
  else return MAX_SPEEDLIMITINDEX;
}
function getSpeedLimitation_Num() {
  switch (getSpeedLimitation_Index()) {
    case 0:
      return 120;
    case 1:
      return 100;
    case 2:
      return 80;
    case 3:
      return 50;
    case 4:
      return 30;
    case 5:
      return 0;
  }
}

function updateAnimalSpeed() {
  let diff = [];
  let order = new Promise((resolve, reject) => {
    for (let i = 0; i < inoData.distanceEnvelopment.length - 1; i++) {
      diff.push(
        inoData.distanceEnvelopment[i] - inoData.distanceEnvelopment[i + 1]
      );
    }
    resolve(diff);
  }).then(diff => {
    let average = 0;
    for (i in diff) average += diff[i];
    inoData.animalSpeed = 5 * (average / diff.length);
  });
}

function animalIsApproaching() {
  if (0 < inoData.animalSpeed - DETECTION_DISCRIMINATIONRANGE) return true;
  return false;
}

function animalIsRemoving() {
  if (inoData.animalSpeed + DETECTION_DISCRIMINATIONRANGE < 0) return true;
  return false;
}

function updateDrivingSpeed() {
  //f(x) = 0.0625 - 16(x-1)  |  x € [0;1]
  // if (simulationState != 2 && simulationState != 3) {
  if (inoData.driver_manualSpeedCoeff != 0) {
    if (inoData.driver_manualSpeedCoeff * MAX_PLAYBACKRATE < MIN_PLAYBACKRATE)
      data.mediaStates.video_pbr = MIN_PLAYBACKRATE;
    else
      data.mediaStates.video_pbr = parseFloat(
        inoData.driver_manualSpeedCoeff * 16
      ).toFixed(10);
    playDrivingVideo();
  } else pauseDrivingVideo();
  // }
  if (simulationState == 3) pauseDrivingVideo();
  data.mediaStates.pinRotation = `rotate(${190 +
    getDrivingSpeed_Coeff() * 170}deg)`;
}

function playSoundEffect() {
  data.eventCodes.playSound = true;
  setTimeout(() => {
    data.eventCodes.playSound = false;
  }, INTERVALFREQ + 10); //weil API frequ = 50; damit der sound nicht bei jedem request wieder gespielt wird
}

function changeSimulationStateTo(int) {
  preSimulationState = simulationState;
  simulationState = int;
  vibrationAvailable = true;
  board.digitalWrite(12, 0);
  data.mediaStates.showInitialWarning = false;
  data.mediaStates.showInitialWarning_cornered = false;
  data.mediaStates.showSpeedlimit = false;
  data.mediaStates.showBrakeSymbol = false;
  data.mediaStates.showCarCommSymbol = false;
  data.mediaStates.showRedLight = false;
  data.mediaStates.showGreenLight = false;
  data.mediaStates.showMediaCenterTexts = false;
  data.mediaStates.showTextSaved = false;
  data.mediaStates.showTextTime = false;
}

function showInitialWarning() {
  if (simulationState == 0) data.mediaStates.showInitialWarning = true;
  else data.mediaStates.showInitialWarning_cornered = true;
}
function hideInitialWarning() {
  data.mediaStates.showInitialWarning = false;
  data.mediaStates.showInitialWarning_cornered = false;
}

function showSpeedLimitation() {
  data.mediaStates.showSpeedlimit = true;
  data.mediaStates.showSpeedlimit_index = getSpeedLimitation_Index();
}
function hideSpeedLimitation() {
  data.mediaStates.showSpeedlimit = false;
}

function showBrakeSymbol() {
  data.mediaStates.showBrakeSymbol = true;
}
function hideBrakeSymbol() {
  data.mediaStates.showBrakeSymbol = false;
}

function showCarCommSymbol() {
  data.mediaStates.showCarCommSymbol = true;
}
function hideCommCarSymbol() {
  data.mediaStates.showCarCommSymbol = false;
}

function showRedLight() {
  data.mediaStates.showRedLight = true;
}
function hideRedLight() {
  data.mediaStates.showRedLight = false;
}

function showGreenLight() {
  data.mediaStates.showGreenLight = true;
}
function hideGreenLight() {
  data.mediaStates.showGreenLight = false;
}

// function showTextSaved() {
//   data.mediaStates.showMediaCenterTexts = true;
//   data.mediaStates.showTextSaved = true;
// }
// function hideTextSaved() {
//   data.mediaStates.showMediaCenterTexts = false;
//   data.mediaStates.showTextSaved = false;
// }

// function showTextTime() {
//   data.mediaStates.showMediaCenterTexts = true;
//   data.mediaStates.showTextTime = true;
// }
// function hideTextTime() {
//   data.mediaStates.showMediaCenterTexts = true;
//   data.mediaStates.showTextTime = true;
// }

function playDrivingVideo() {
  data.eventCodes.playVideo = true;
}
function pauseDrivingVideo() {
  data.eventCodes.playVideo = false;
  data.mediaStates.pinRotation = `rotate(${190}deg)`;
}

function vibrateOnce() {
  if (vibrationAvailable) {
    board.digitalWrite(13, 1);
    setTimeout(() => {
      board.digitalWrite(13, 0);
    }, 1000);
    vibrationAvailable = false;
  }
}

function updatePulseStates() {
  if (data.mediaStates.lightPulseState == MAX_LIGHTPULSERANGE)
    data.mediaStates.lightPulseState = 0;
  data.mediaStates.lightPulseState++;
  if (data.mediaStates.textPulseState == MAX_TEXTPULSERANGE)
    data.mediaStates.textPulseState = 0;
  data.mediaStates.textPulseState++;
}

function getLightPulseState() {
  if (data.mediaStates.lightPulseState < MAX_LIGHTPULSERANGE / 2) return true;
  else return false;
}

function blinkWarningLights() {
  if (getLightPulseState() == true) board.digitalWrite(12, 1);
  if (getLightPulseState() == false) board.digitalWrite(12, 0);
}

function getTextPulseState() {
  if (data.mediaStates.textPulseState < MAX_TEXTPULSERANGE / 2) return true;
  else return false;
}

function showWaitingTexts() {
  data.mediaStates.showMediaCenterTexts = true;
  if (getTextPulseState() == true) {
    data.mediaStates.showTextTime = false;
    data.mediaStates.showTextSaved = true;
  } else {
    data.mediaStates.showTextSaved = false;
    data.mediaStates.showTextTime = true;
  }
}
