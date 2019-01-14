var w = window.innerWidth, h = window.innerHeight;
var canvas = document.getElementById("canvas");
var gl = canvas.getContext("webgl");

var prog, // WebGL program
    uAnimationPosition; // Locations of uniforms

var sendR = false;
var average = 0.5;
var c = document.getElementById("cvs");
var ctx = c.getContext("2d");
var bodyElement = document.getElementById("body");
var spectrum;
var peak_volume = 0;
var hueShift = 0;
var rmsAvgs = [];
var rmsAvgsLong = [];
var smoothSpec = [];
var rmsMean;
var rmsMeanLong;
var width, height;
//var gridWidth = 15,
//    gridHeight = 20;
var gridWidth = 8,
    gridHeight = 8;
// Number of circles and datapoints
var num_circles = gridWidth*gridHeight, num_datapoints = 2;
var pulse = false;
var websocket;
var sending = false;
var drawing = true;






function initCanvas() {
    // Set the canvas dimensions and the WebGL viewport
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function glInit() {
    // Load and compile the shaders
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, document.getElementById("shader-fs").textContent);
    gl.compileShader(fragmentShader);
    var vertexShader = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vertexShader, document.getElementById("shader-vs").textContent);
    gl.compileShader(vertexShader);

    // Create the WebGL program
    prog = gl.createProgram();
    gl.attachShader(prog, vertexShader);
    gl.attachShader(prog, fragmentShader);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Global WebGL configuration
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Initialise uTransformToClipSpace
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, "uTransformToClipSpace"), false, [
        2 / w, 0, 0,
        0, - 2 / h, 0,
        -1, 1, 1
    ]);

    // Get the location of the uAnimationPosition uniform
    uAnimationPosition = gl.getUniformLocation(prog, "uAnimationPosition");

    // Enable the attributes
    gl.enableVertexAttribArray(gl.getAttribLocation(prog, "aPosition"));
    gl.enableVertexAttribArray(gl.getAttribLocation(prog, "aR"));
    gl.enableVertexAttribArray(gl.getAttribLocation(prog, "aColor"));

    return prog;
}

function drawScene(animation_position) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uAnimationPosition, animation_position);
    gl.drawArrays(gl.POINTS, 0, num_circles);
}

var datapoint = 0;

function generateRandomCircles() {
    var circles = [];
    var dx = Math.floor(Math.sqrt(num_circles));
    for (var i = 0; i < num_circles; i++) {
        var circle = {
            x: (i % dx) / dx * w,
            y: (i / num_circles) * h,
            radius: [], color: []
        };
        for (var j = 0; j < num_datapoints; j++) {
            circle.radius.push(4);//Set radius
            circle.color.push([0.26, 0.0, 0.5]);//[ Math.random(), Math.random(), Math.random() ]);
        }
        circles.push(circle);
    }
    return circles;
}

function loadCircles(circles) {
    var floats_per_datapoint = 4,
        floats_per_circle = 2 + num_datapoints * floats_per_datapoint;

    // Pack the circle data into an array of floats
    var data = new Float32Array(num_circles * floats_per_circle);
    for (var i = 0; i < num_circles; i++) {
        var circle = circles[i];
        data[i * 2] = circle.x;
        data[i * 2 + 1] = circle.y;

        for (var j = 0; j < num_datapoints; j++) {
            data[num_circles * (2 + j) + i] = circle.radius[j];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3] = circle.color[j][0];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3 + 1] = circle.color[j][1];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3 + 2] = circle.color[j][2];
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    attrib("aPosition", 2, 0);
    selectDatapoint(datapoint);
}

function reloadCircles(circles) {
    var floats_per_datapoint = 4,
        floats_per_circle = 2 + num_datapoints * floats_per_datapoint;

    // Pack the circle data into an array of floats
    var data = new Float32Array(num_circles * floats_per_circle);
    for (var i = 0; i < num_circles; i++) {
        var circle = circles[i];
        data[i * 2] = circle.x;
        data[i * 2 + 1] = circle.y;

        for (var j = 0; j < num_datapoints; j++) {
            data[num_circles * (2 + j) + i] = circle.radius[j];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3] = circle.color[j][0];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3 + 1] = circle.color[j][1];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3 + 2] = circle.color[j][2];
        }
    }

    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);

    attrib("aPosition", 2, 0);
    selectDatapoint(datapoint);
}

function loadSpectrum(bArray) {
    var circles = [];
    var pad = 20;
    var rad = (Math.min((width - 2 * pad) / gridWidth, (height*2 - 2 * pad) / gridHeight));
    for (var i = 0; i < num_circles; i++) {
        var circle = {
            x: rad * ((i) % gridWidth + 0.5) + (width - gridWidth * rad)/2,
            y: rad * (Math.floor((i) / gridWidth) + 0.5) +  height + pad,
            radius: [], color: []
        };
        circle.radius.push(rad/2);//Set radius
        circle.color.push([bArray[i * 3 + 1], bArray[i * 3 + 2], bArray[i * 3 + 3]]);
        circles.push(circle);
    }

    var floats_per_datapoint = 4,
        floats_per_circle = 2 + num_datapoints * floats_per_datapoint;

    // Pack the circle data into an array of floats
    var data = new Float32Array(num_circles * floats_per_circle);
    for (var i = 0; i < (bArray.length - 1) / 3; i++) {
        var circle = circles[i];
        data[i * 2] = circle.x;
        data[i * 2 + 1] = circle.y;

        for (var j = 0; j < num_datapoints; j++) {
            data[num_circles * (2 + j) + i] = circle.radius[0];
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3] = bArray[i * 3 + 1]/255;
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3 + 1] = bArray[i * 3 + 2]/255;
            data[num_circles * (2 + num_datapoints + 3 * j) + i * 3 + 2] = bArray[i * 3 + 3]/255;
        }
    }

    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);

    attrib("aPosition", 2, 0);
    selectDatapoint(datapoint);
}

function selectDatapoint(i) {
    i = 0;
    //console.log("selectDatapoint", i);

    attrib("aR", 1, (2 + i + 1) * num_circles);
    attrib("aColor", 3, (2 + num_datapoints + 3 * i) * num_circles);
}

function attrib(attrib_name, size, offset) {
    gl.vertexAttribPointer(gl.getAttribLocation(prog, attrib_name),
        size, gl.FLOAT, false, size * 4, offset * 4);
}
initCanvas();
glInit();

loadCircles(generateRandomCircles());





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
        analyser.getByteFrequencyData(spectrum);
        self.rms = self.getRMS(spectrum);
        rmsAvgs.push(self.rms);
        rmsAvgsLong.push(self.rms);
        rmsAvgs = rmsAvgs.slice(-1 * 10);
        rmsAvgsLong = rmsAvgsLong.slice(-1 * 100);
        rmsMean = rmsAvgs.reduce((p, c) => c += p) / rmsAvgs.length;
        rmsMeanLong = rmsAvgsLong.reduce((p, c) => c += p) / rmsAvgsLong.length;
        self.vol = Math.max(...spectrum);
        smoothSpec = [];
        var temp = 0;
        var temp2 = 0;
        for (var i = 0; i < spectrum.length; i++) {
            temp += spectrum[i];
            temp2++;
            if (i % 10 == 0) {
                smoothSpec.push(temp / temp2 / rmsMeanLong);
                temp = temp2 = 0;
            }
        }
        if (self.vol > self.peak_volume) {
            self.peak_volume = self.vol;
        }
        if (self.rms > rmsMean*1.1 + 3 && self.rms > rmsMeanLong) {
            console.log("loud");
            pulse = true;
            bodyElement.style = "background: white";
            //sendRand(Math.pow(self.vol / self.peak_volume, 5));*/
            if (drawing) hueShift += self.rms;
        } else {
            if (drawing) bodyElement.style = "background: black";
        }
        draw();
    };
    var input = context.createMediaStreamSource(stream);
    input.connect(analyser);
    this.getRMS = function (spectrum) {
        var rms = 0;
        for (var i = 0; i < spectrum.length; i++) {
            rms += spectrum[i] * spectrum[i];
        }
        rms /= spectrum.length;
        rms = Math.sqrt(rms);
        //console.log(rms);
        return rms;
    };
};

var wsUri = "ws://192.168.0.87/ws";
//var wsUri = "ws://192.168.4.1/ws";

function init() {
    c.width = width = window.innerWidth;
    c.height = height = window.innerHeight / 3;
    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
    }).then(handleSuccess);
    //setInterval(draw, 16);
    initWebSocket();
}

function initWebSocket() {
    websocket = new WebSocket(wsUri);
    websocket.binaryType = "arraybuffer";
    websocket.onopen = function (evt) {
        onOpen(evt);
    };
    websocket.onclose = function (evt) {
        onClose(evt);
    };
    websocket.onmessage = function (evt) {
        onMessage(evt);
    };
    websocket.onerror = function (evt) {
        onError(evt);
    };
}

function onOpen(evt) {
    console.log("CONNECTED");
    sending = true;
}

function onClose(evt) {
    console.log("DISCONNECTED");
    sending = false;
    initWebSocket();
}

function draw() {
    if (spectrum) {
        if (drawing) {
            ctx.beginPath();
            ctx.fillStyle = 'blue';
            ctx.clearRect(0, 0, c.width, c.height);//0.16ms
            var thiccnes = (width - 20) / smoothSpec.length;
            for (var i = 0; i < smoothSpec.length; i++) {
                var s = smoothSpec[i] * 40;
                ctx.rect(i * thiccnes, height - s * (height / 200), thiccnes, s * (height / 200));
            }
            ctx.fill();
            drawScene();//0.79ms
        }
        if (pulse) sendPulse();
        else sendPattern01();
        pulse = false;
    }
}

function drawPoints(bArray) {
    loadSpectrum(bArray);
    /*var pad = 20;
    var rad = Math.min((width - 2 * pad) / gridWidth, (height * (2 / 3) - 2 * pad) / gridHeight);
    var x, y = 0;
    for (var i = 1; i <= (bArray.length - 1) / 3; i++) {
        ctx.beginPath();
        ctx.fillStyle = "rgb(" + bArray[i * 3 + 1] + "," + bArray[i * 3 + 2] + "," + bArray[i * 3 + 3] + ")";
        x = rad * ((i - 1) % gridWidth + 0.5) + (width - gridWidth * rad) / 2;
        y = rad * (Math.floor((i - 1) / gridWidth) + 0.5) + (1 / 3) * height + pad;
        ctx.arc(x, y, rad * 0.45, 2 * Math.PI, false);
        ctx.fill();
    }*/
}

function sendRand(scale) {
    console.log(scale)
    bytearray = new Uint8Array((gridWidth * gridHeight) * 3 + 1);
    bytearray[0] = 'a'.charCodeAt(0);
    for (var i = 1; i <= (gridWidth * gridHeight) * 3; ++i) {
        bytearray[i] = Math.random() * 255 * scale;
    }
    if (websocket != undefined && websocket.readyState) websocket.send(bytearray);
}

function sendSpectrum() {
    bytearray = new Uint8Array((gridWidth * gridHeight) * 3 + 1);
    bytearray[0] = 'a'.charCodeAt(0);
    for (var i = 0; i < (gridWidth * gridHeight); i++) {
        var color = jsLib.color.hsv2Rgb((((i + hueShift) / bytearray.length) % 1) * HUE_MAX, 100, spectrum[i] / peak_volume * 100);
        bytearray[i * 3 + 1] = parseInt(color.r);
        bytearray[i * 3 + 2] = parseInt(color.g);
        bytearray[i * 3 + 3] = parseInt(color.b);
    }
    if (drawing) drawPoints(bytearray);
    if (sending && websocket != null && websocket.readyState) websocket.send(bytearray);
}

function sendPulse() {
    bytearray = new Uint8Array((gridWidth * gridHeight) * 3 + 1);
    bytearray.fill(255);
    bytearray[0] = 'a'.charCodeAt(0);
    if (drawing) drawPoints(bytearray);
    if (sending && websocket != undefined && websocket.readyState) websocket.send(bytearray);
}

function sendPattern01() {
    bytearray = new Uint8Array((gridWidth * gridHeight) * 3 + 1);
    bytearray[0] = 'a'.charCodeAt(0);
    var cx = gridWidth / 2;
    var cy = gridHeight / 2;
    var low = 2;
    var step = 3;
    var scale = 1;
    var base = 0.8;
    for (var i = 0; i < gridWidth; i++) {
        for (var j = 0; j < gridHeight; j++) {
            var ang = Math.atan2(i - cx, j - cy) + Math.PI;
            var rad = Math.sqrt(Math.pow(i - cx, 2) + Math.pow(j - cy, 2));
            var color;
            if (smoothSpec[Math.round(low + ang * step)] < rad * scale - base) {
                color = {
                    r: 0,
                    g: 0,
                    b: 0
                };
            } else {
                color = jsLib.color.hsv2Rgb((((rad + hueShift) * 100 / bytearray.length) % 1) * HUE_MAX, 100, spectrum[Math.round(rad)] / peak_volume * 100);
            }
            bytearray[(i + gridWidth * j) * 3 + 1] = parseInt(color.r);
            bytearray[(i + gridWidth * j) * 3 + 2] = parseInt(color.g);
            bytearray[(i + gridWidth * j) * 3 + 3] = parseInt(color.b);
        }
    }
    if (drawing) drawPoints(bytearray);
    if (websocket != null && websocket.readyState) websocket.send(bytearray);
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

window.addEventListener('resize', () => {
    c.width = width = window.innerWidth;
    c.height = height = window.innerHeight / 3;
});

window.addEventListener("load", init, false);