/*
 This script is reading the temperature from a Shelly Device through the
 Shelly Cloud. In this case it is a Shelly Plus T&H.
 As it is not yet clear if I can read data more directly I am using "device/status".
 
 Author: abx7046
 Date: April 2023 
*/

// key parameters
let DeviceDataFetchInterval = 11; // in minutes. Shelly Plus H&T Data
let OutdoorDataFetchInterval = 30; // in minutes. Openweathermap Data
let OnOffThreshold = 6; // degree celcius to switch the Actuator active.

// 
let PARAM = {
    UTCOffset: 0, // offset of 2 hours => summer time and central europe
    UTCOffsetValidated: false,
    Interval: 17, // in minutes as used by the Timer functions
    TimeOut: 2, // number of inerations till stopping changing mode.
    Counter: 0, // counter used for the tie out
    PreviousTimeStamp: 0,
    Handler: null,
    ActuatorOn: true, // to be on the safe side we assume it is on.
    };

let timeArray = [
//               hour  min          hour   min            tC
        {Start: (00*60+00)*60, End: (05*60+15)*60, Value: 20.6}, // 00:00 - 05:15
        {Start: (05*60+16)*60, End: (08*60+44)*60, Value: 16.0}, // 05:16 - 08:44
        {Start: (08*60+45)*60, End: (21*60+00)*60, Value: 20.8},  // 08:45 - 21:00
        {Start: (21*60+01)*60, End: (22*60+29)*60, Value: 16.0},  // 21:01 - 22:29
        {Start: (22*60+30)*60, End: (23*60+59)*60, Value: 20.6}, // 22:30 - 23:59   
        ];
             
let tmpShellyCloud = {
      url: "https://shelly-50-eu.shelly.cloud",
      action: "/device/status?",
      deviceID: "<deviceID>",
      auth_key: "<auth_key>"
     };
    
function strtoint(arg) {
  let Int0To9 = [{I: "0", i:0}, {I: "1", i:1}, {I: "2", i:2}, {I: "3", i:3}, {I: "4", i:4},
                 {I: "5", i:5}, {I: "6", i:6}, {I: "7", i:7}, {I: "8", i:8}, {I: "9", i:9}];
  let value = 0;
  for (let j=0; j< arg.length; j++) {
    let found = false;
    for (let i=0; i< Int0To9.length; i++) {
      if (arg[j] === Int0To9[i].I && found === false) {
        value = value*10 + Int0To9[i].i;
        found = true;
      }; // of if
    }; // of for
  };
  return value;
};

// this funciton is checking if the data as provided by Shelly.Cloud gets updated.
// we are doing this to see if the device timestamp does change over the time      
function DeviceStillOnline (argTimeStamp) {
  if (argTimeStamp === PARAM.PreviousTimeStamp) {
    if (PARAM.Counter < PARAM.TimeOut) {
      PARAM.Counter += 1;
        return(true)
      } else {
        print("same timestamp and max timeout reached!")
        return(false);
      }     
  } else {
    PARAM.PreviousTimeStamp = argTimeStamp;
    PARAM.Counter = 0;
    return(true);
  };
};
        
function processHTTPDevice(result, error_code, error) {
  if (error_code !== 0) {
    // process error
  } else {
    // process result
   let json_value = JSON.parse(result.body)["data"]["device_status"]["temperature:0"]["tC"];
   let json_unixtime = JSON.parse(result.body)["data"]["device_status"]["ts"];
   let UnixTime = Math.round(json_unixtime)%(24*60*60);
   let json_time = JSON.parse(result.body)["data"]["device_status"]["sys"]["time"];
   if (json_time !== null && PARAM.UTCOffsetValidated === false) {
     let oldUTCOffset = PARAM.UTCOffset;
     PARAM.UTCOffset = strtoint(json_time.slice(0,2)) - Math.floor(UnixTime/60/60);  
     print("UTC Offset adj from ", oldUTCOffset," to ", PARAM.UTCOffset);
     PARAM.UTCOffsetValidated = true;
   };
   UnixTime += PARAM.UTCOffset*60*60;
   print(json_value, "@ hour=",Math.floor(UnixTime/60/60),
     "; min=",Math.floor(UnixTime/60-Math.floor(UnixTime/60/60)*60),
     "or in sec=", UnixTime);  
   // here we check on the timeout and drop out of this function if true
   if (DeviceStillOnline(UnixTime) === false) {
     print("ABX: please do check if Shelly Plus T&H is online.");
     Shelly.call("Switch.set", {'id': 0, 'on': false});
     return; // leave the function
   };
 
  // here we go through the array and we set the switch accordingly.
  // below the value => on; above and equal the value => off;
  for (let i=0; i< timeArray.length; i++) {
   if (UnixTime >= timeArray[i].Start && UnixTime <= timeArray[i].End) {
        print(UnixTime, " is between ",timeArray[i].Start,
              " and ",timeArray[i].End,
              "actual temp: ", json_value,
              "threshold: ", timeArray[i].Value);
        print("Interval: ", PARAM.Interval, " min");
        if (json_value < timeArray[i].Value) {
           // switch on the actuator
          if (PARAM.ActuatorOn === false) {print("Turn Actuater On")};
           Shelly.call("Switch.set", {'id': 0, 'on': true});
           PARAM.ActuatorOn = true;
        } else {
          // switch off the actuator
          if (PARAM.ActuatorOn === true) {print("Turn Actuater Off")};
          Shelly.call("Switch.set", {'id': 0, 'on': false});
          PARAM.ActuatorOn = false;
        }; // end of if-else json_value check
    }; // enf of if UnixTime Slot check
  }; // end of for
}; // end of if-else
};

let DeviceURL = tmpShellyCloud.url + tmpShellyCloud.action +
            "id=" + tmpShellyCloud.deviceID +
            "&auth_key=" + tmpShellyCloud.auth_key;
            
function getDeviceData() {
  Shelly.call("HTTP.GET", {url: DeviceURL}, processHTTPDevice);
}

print("start");
// first thing we do to set the actuator to off.
Shelly.call("Switch.set", {'id': 0, 'on': false});
PARAM.ActuatorOn = false;

getDeviceData(); // to get the data from the device as we need some information

/*
 new let use read the outdoor temperature and see what we could to with it.
one option might be to adjust the timing/interval paramters in above routine.
*/

let CONFIG = {
  APIKEY: "<api_key>",
  weatherCurrentEndpoint: "https://api.openweathermap.org/data/2.5/weather",
  checkInterval: OutdoorDataFetchInterval * 60 * 1000, // means every 2 minute(s)
  location: "city,country_code", // e.g. paris,fr
  units: "metric",
  threshold: OnOffThreshold, // the value it toggles from one state to the other
  UTCOffset: PARAM.UTCOffset,
};

let GLOBAL = {UnixTime: 1000, BelowThreshold: false, Handler: null};

function processHTTPWeather(result, error_code, error) {
  if (error_code !== 0) {
    // process error
  } else {
    // process result
    let weatherData  = JSON.parse(result.body)["main"]["temp"];
    GLOBAL.UnixTime = Math.round(JSON.parse(result.body)["dt"])%(24*60*60) +
    CONFIG.UTCOffset*60*60;
    console.log("Outdoor: ", weatherData, "(Threshold: ", CONFIG.threshold,")");
    if (weatherData < CONFIG.threshold) {
        if (GLOBAL.BelowThreshold === false) {
          console.log("Bath Thermostat Active => as Outdoor temperature is below threshold");
          if (GLOBAL.Handler !== null) {Timer.clear(GLOBAL.Handler)};
          PARAM.Interval = DeviceDataFetchInterval;
          GLOBAL.Handler = Timer.set(1000*60*PARAM.Interval, true, getDeviceData, null);;
        }
        GLOBAL.BelowThreshold = true;
      } else if (weatherData >= CONFIG.threshold) {
         if (GLOBAL.BelowThreshold === true) {
          console.log("Bath Thermostat Not Active => as Outdoor temperature is above threshold");
          if (GLOBAL.Handler !== null) {Timer.clear(GLOBAL.Handler)};
        }
        GLOBAL.BelowThreshold = false;
     } else {console.log("No condition met!")}
  }
}

let weatherURL = CONFIG.weatherCurrentEndpoint +
            "?q=" + CONFIG.location +
            "&APPID=" + CONFIG.APIKEY +
            "&units=" + CONFIG.units;

function getOutdoorTemp() {
  Shelly.call("HTTP.GET", {url: weatherURL}, processHTTPWeather);
}

getOutdoorTemp();

Timer.set(CONFIG.checkInterval, true, getOutdoorTemp, null);

