var sendR = false;
var average = 0.5;
var c = document.getElementById("cvs");
var ctx = c.getContext("2d");
var bodyElement = document.getElementById("body");
var spectrum;
var peak_volume = 0;
var hueShift = 0;
var rmsAvgs = new Array();
var rmsMean;
var width, height;
var pulse = false;
var websocket;
var sending = false;
var drawing = true;

var FFT_SIZE = 1024;
var handleSuccess = function (stream) {
    var context = new AudioContext();
    var source = context.createMediaStreamSource(stream);
    var processor = context.createScriptProcessor(1024, 1, 1);

    var analyser = context.createAnalyser();
    analyser.smoothingTimeConstant = 0.2;
    analyser.fftSize = FFT_SIZE;

    source.connect(processor);
    processor.connect(context.destination);

    processor.onaudioprocess = function (audioProcessingEvent) {
        spectrum = new Uint8Array(analyser.frequencyBinCount);
        // getByteFrequencyData returns amplitude for each bin
        analyser.getByteFrequencyData(spectrum);
        // getByteTimeDomainData gets volumes over the sample time
        // analyser.getByteTimeDomainData(spectrum);

        self.rms = self.getRMS(spectrum);
        rmsAvgs.push(self.rms);
        rmsAvgs = rmsAvgs.slice(-1 * 10);
        rmsMean = rmsAvgs.reduce((p, c) => c += p) / rmsAvgs.length
        self.vol = spectrum.reduce(function (a, b) {
            return Math.max(a, b);
        });
        // get peak - a hack when our volumes are low
        if (self.vol > self.peak_volume) { self.peak_volume = self.vol; }

        /*var inputBuffer = audioProcessingEvent.inputBuffer;
        var inputData = inputBuffer.getChannelData(channel);
        for (var channel = 0; channel < inputBuffer.numberOfChannels; channel++) {
            var inputData = inputBuffer.getChannelData(channel);
            var outputData = new Array();

            // Loop through the 4096 samples
            for (var sample = 0; sample < inputBuffer.length; sample++) {
                // make output equal to the same as the input
                outputData[sample] = inputData[sample];
                if (inputData[sample] > 0.5) {
                    sendR = true;
                    console.log("loud!");
                }
            }
        }
        if (sendR) {
            sendRand();
            sendR = false;
        }*/
        if (self.rms > rmsMean + 3 && self.rms > 15) {
            console.log("loud");
            pulse = true;
            bodyElement.style = "background: white";
            //sendRand(Math.pow(self.vol / self.peak_volume, 5));*/
            if (drawing) hueShift += self.rms;
        }
        else { if (drawing) bodyElement.style = "background: black" };
    }
    var input = context.createMediaStreamSource(stream);
    input.connect(analyser);
    this.getRMS = function (spectrum) {
        var rms = 0;
        for (var i = 0; i < 10/*vols.length*/; i++) {
            rms += spectrum[i] * spectrum[i];
        }
        rms /= spectrum.length;
        rms = Math.sqrt(rms);
        //console.log(rms);
        return rms;
    }
};

navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(handleSuccess);

function hslToRgb(h, s, l) {
    var r, g, b;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r * 255, g * 255, b * 255];
}

var wsUri = "ws://192.168.0.87/ws";
//var wsUri = "ws://192.168.4.1/ws";


function init() {
    c.width = width = window.innerWidth; c.height = height = window.innerHeight;
    setInterval(draw, 16);
    testWebSocket();
}

function testWebSocket() {
    websocket = new WebSocket(wsUri);
    websocket.binaryType = "arraybuffer";
    websocket.onopen = function (evt) { onOpen(evt) };
    websocket.onclose = function (evt) { onClose(evt) };
    websocket.onmessage = function (evt) { onMessage(evt) };
    websocket.onerror = function (evt) { onError(evt) };
}

async function onOpen(evt) {
    console.log("CONNECTED");
    sending = true;
}

function onClose(evt) {
    console.log("DISCONNECTED");
    sending = false;
    testWebSocket();
}

function draw() {
    pulse = false;
    if (drawing) {
        ctx.clearRect(0, 0, c.width, c.height);
        var thiccnes = (width - 20) / spectrum.length;
        for (var i = 0; i < spectrum.length; i++) {
            var s = spectrum[i];
            ctx.fillStyle = 'blue'//hsl(map(i, 0, 200, 0, 360), 80, 50);
            ctx.fillRect(i * thiccnes, height / 3 - s * (height / 1000), thiccnes, s * (height / 1000));
            //ctx.fillRect(i * 2, 300, 2, s);
        }
    }
    if (pulse) sendPulse();
    else sendSpectrum();
}

function drawPoints(bArray) {
    var rows = Math.floor(height / width * 12);
    var thiccnes = (bArray.length * (width / 5000)) / rows;
    for (var i = 1; i < bArray.length / 3 + 1; i++) {
        var down = (Math.floor((i - 1) / (144 / rows + 1)));
        ctx.fillStyle = "rgb(" + bArray[i * 3 + 1] + "," + bArray[i * 3 + 2] + "," + bArray[i * 3 + 3] + ")";
        ctx.beginPath();
        ctx.arc(i * thiccnes - down * (bArray.length / 3 + 1) / rows * thiccnes, height / 3 + 50 + down * ((height / 3) / rows), thiccnes / 3, 0, 2 * Math.PI, false);
        ctx.fill();
    }
}

function sendRand(scale) {
    console.log(scale)
    bytearray = new Uint8Array(144 * 3 + 1);
    bytearray[0] = 'a'.charCodeAt(0);
    for (var i = 1; i <= 144 * 3; ++i) { bytearray[i] = Math.random() * 255.0 * scale; }
    if (websocket != undefined && websocket.readyState) websocket.send(bytearray);
}

function sendSpectrum() {
    bytearray = new Uint8Array(144 * 3 + 1);
    bytearray[0] = 'a'.charCodeAt(0);
    for (var i = 0; i < 144; i++) {
        var color = hslToRgb(((i + hueShift) / bytearray.length) % 1, 1, spectrum[i] / peak_volume)
        bytearray[i * 3 + 1] = parseInt(color[0]);
        bytearray[i * 3 + 2] = parseInt(color[1]);
        bytearray[i * 3 + 3] = parseInt(color[2]);
    }
    if (drawing) drawPoints(bytearray);
    if (!(websocket == null)
        && websocket.readyState) websocket.send(bytearray);
}

function sendPulse() {
    bytearray = new Uint8Array(144 * 3 + 1);
    bytearray.fill(255);
    bytearray[0] = 'a'.charCodeAt(0);
    if (drawing) drawPoints(bytearray);
    if (websocket != undefined && websocket.readyState) websocket.send(bytearray);
}

function onMessage(evt) {
    console.log(evt.data);
    //websocket.close();
}

function onError(evt) {
    console.log(evt.data);
}

document.onkeydown = function (evt) {
    if (evt.keyCode === 32) {
        sendRand();
    }
};
document.onpointerup = function (evt) {
    drawing = !drawing;
}

window.addEventListener('resize', () => { c.width = width = window.innerWidth; c.height = height = window.innerHeight; });

window.addEventListener("load", init, false);
