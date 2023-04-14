/*
 This script is reading the temperature from a Shelly Device through the
 Shelly Cloud. In this case it is a Shelly Plus T&H.
 As it is not yet clear if I can read data more directly I am using "device/status".
 
 Author: abx7046
 Date: April 2023 
*/

// key parameters
let DeviceDataFetchInterval = 11; // in minutes. Shelly Plus H&T Data
let OutdoorDataFetchInterval = 27; // in minutes. Openweathermap Data
let OnOffThreshold = 6; // degree celcius to switch the Actuator active.

let PIandKeys = {
      SHELLY: { 
        deviceID: "<deviceID>",
        auth_key: "<key>",
      },
      OpenWeather: { 
        APIKEY: "<key>",      
        location: "city, country",
        latitude: 00.0000, // source: https://www.latlong.net
        longitude: 0.0000, // source: https://www.latlong.net
      },
    };
        
// 
let PARAM_THERMOSTAT = {
    UTCOffset: 0, // offset of 2 hours => summer time and central europe
    UTCOffsetValidated: false,
    Interval: 13, // in minutes as used by the Timer functions
    TimeOut: 2, // number of inerations till stopping changing mode.
    Counter: 0, // counter used for the tie out
    PreviousTimeStamp: 0,
    Handler: null,
    ActuatorOn: true, // to be on the safe side we assume it is on.
    };

let Schedules = [
//               hour  min          hour   min            tC
        {Start: (00*60+00)*60, End: (05*60+15)*60, Value: 20.6}, // 00:00 - 05:15
        {Start: (05*60+16)*60, End: (08*60+44)*60, Value: 16.0}, // 05:16 - 08:44
        {Start: (08*60+45)*60, End: (21*60+00)*60, Value: 20.8},  // 08:45 - 21:00
        {Start: (21*60+01)*60, End: (22*60+29)*60, Value: 16.0},  // 21:01 - 22:29
        {Start: (22*60+30)*60, End: (23*60+59)*60, Value: 20.6}, // 22:30 - 23:59   
        ];
    
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
  //print(argTimeStamp);
  if (argTimeStamp === PARAM_THERMOSTAT.PreviousTimeStamp) {
    if (PARAM_THERMOSTAT.Counter < PARAM_THERMOSTAT.TimeOut) {
      PARAM_THERMOSTAT.Counter += 1;
      //print("same timestamp, counter at: ", PARAM.Counter)
      return(true)
      } else {
        print("same timestamp and max timeout reached!")
        return(false);
      }     
  } else {
    //print("new timestamp. Prev: ", PARAM.PreviousTimeStamp, "New: ", argTimeStamp);
    PARAM_THERMOSTAT.PreviousTimeStamp = argTimeStamp;
    PARAM_THERMOSTAT.Counter = 0;
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
   if (json_time !== null && PARAM_THERMOSTAT.UTCOffsetValidated === false) {
     let oldUTCOffset = PARAM_THERMOSTAT.UTCOffset;
     PARAM_THERMOSTAT.UTCOffset = strtoint(json_time.slice(0,2)) - Math.floor(UnixTime/60/60);  
     print("UTC Offset adj from ", oldUTCOffset," to ", PARAM_THERMOSTAT.UTCOffset);
     PARAM_THERMOSTAT.UTCOffsetValidated = true;
   };
   UnixTime += PARAM_THERMOSTAT.UTCOffset*60*60;
   print(json_value, "@ hour:",Math.floor(UnixTime/60/60),
     " min:",Math.floor(UnixTime/60-Math.floor(UnixTime/60/60)*60),
     "or in sec:", UnixTime);  
   // here we check on the timeout and drop out of this function if true
   if (DeviceStillOnline(UnixTime) === false) {
     print("WARNING: please do check if Shelly Plus T&H is online.");
     Shelly.call("Switch.set", {'id': 0, 'on': false});
     return; // leave the function
   };
 
  // here we go through the array and we set the switch accordingly.
  // below the value => on; above and equal the value => off;
  for (let i=0; i< Schedules.length; i++) {
   if (UnixTime >= Schedules[i].Start && UnixTime <= Schedules[i].End) {
        print(UnixTime, " is between ",Schedules[i].Start,
              " and ",Schedules[i].End,
              "actual temp: ", json_value,
              "threshold: ", Schedules[i].Value);
        print("Interval: ", PARAM_THERMOSTAT.Interval, " min");
        if (json_value < Schedules[i].Value) {
           // switch on the actuator
          if (PARAM_THERMOSTAT.ActuatorOn === false) {print("Turn Actuater On")};
           Shelly.call("Switch.set", {'id': 0, 'on': true});
           PARAM_THERMOSTAT.ActuatorOn = true;
        } else {
          // switch off the actuator
          if (PARAM_THERMOSTAT.ActuatorOn === true) {print("Turn Actuater Off")};
          Shelly.call("Switch.set", {'id': 0, 'on': false});
          PARAM_THERMOSTAT.ActuatorOn = false;
        }; // end of if-else json_value check
    }; // enf of if UnixTime Slot check
  }; // end of for
}; // end of if-else
};

let DeviceURL = "https://shelly-50-eu.shelly.cloud" + "/device/status?" +
            "id=" + PIandKeys.SHELLY.deviceID +
            "&auth_key=" + PIandKeys.SHELLY.auth_key;
            
function getDeviceData() {
  //console.log("function: getDeviceData()");
  Shelly.call("HTTP.GET", {url: DeviceURL}, processHTTPDevice);
}

print("start");
// first thing we do to set the actuator to off.
Shelly.call("Switch.set", {'id': 0, 'on': false});
PARAM_THERMOSTAT.ActuatorOn = false;

getDeviceData();

let PARAM_OPENWEATHER = {
  weatherCurrentEndpoint: "https://api.openweathermap.org/data/2.5/weather",
  checkInterval: OutdoorDataFetchInterval * 60 * 1000, // means every 2 minute(s)
  units: "metric",
  threshold: OnOffThreshold, // the value it toggles from one state to the other
  UTCOffset: PARAM_THERMOSTAT.UTCOffset,
};

let GLOBAL = {UnixTime: 1000, BelowThreshold: false, Handler: null};

function processHTTPWeather(result, error_code, error) {
  if (error_code !== 0) {
    // process error
  } else {
    // process result
    let weatherData  = JSON.parse(result.body)["main"]["temp"];
    GLOBAL.UnixTime = Math.round(JSON.parse(result.body)["dt"])%(24*60*60) +
    PARAM_OPENWEATHER.UTCOffset*60*60;
    if (weatherData < PARAM_OPENWEATHER.threshold) {
        if (GLOBAL.BelowThreshold === false) {
          console.log("Outdoor: ", weatherData,
                      "(Threshold: ", PARAM_OPENWEATHER.threshold,") => ",
                      "Bath Thermostat Active => as Outdoor temperature is below threshold");
          if (GLOBAL.Handler !== null) {Timer.clear(GLOBAL.Handler)};
          PARAM_THERMOSTAT.Interval = DeviceDataFetchInterval;
          GLOBAL.Handler = Timer.set(1000*60*PARAM_THERMOSTAT.Interval, true, getDeviceData, null);;
        }
        GLOBAL.BelowThreshold = true;
      } else if (weatherData >= PARAM_OPENWEATHER.threshold) {
         if (GLOBAL.BelowThreshold === true) {
          console.log("Outdoor: ", weatherData, 
                      "(Threshold: ", PARAM_OPENWEATHER.threshold,")",
                      "Bath Thermostat Not Active => as Outdoor temperature is above threshold");
          if (GLOBAL.Handler !== null) {Timer.clear(GLOBAL.Handler)};
          } else { 
                print("Outdoor: ", weatherData," (Threshold: ",PARAM_OPENWEATHER.threshold,
                      "), Bath Thermostat is OFF")
                  }
        GLOBAL.BelowThreshold = false;
     } else {console.log("No condition met!")}
  }
}

let weatherURL = PARAM_OPENWEATHER.weatherCurrentEndpoint +
            "?q=" + PIandKeys.OpenWeather.location +
            "&APPID=" + PIandKeys.OpenWeather.APIKEY +
            "&units=" + PARAM_OPENWEATHER.units;

function getOutdoorTemp() {
  Shelly.call("HTTP.GET", {url: weatherURL}, processHTTPWeather);
}

getOutdoorTemp();

Timer.set(PARAM_OPENWEATHER.checkInterval, true, getOutdoorTemp, null);



