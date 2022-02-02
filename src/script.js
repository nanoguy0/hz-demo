setTimeout(() => {
    $('#startMenu').fadeIn();
}, 500);

const debug = false;

async function start() {
    await new Promise((res) => $('#startMenu').fadeOut(() => $('#startMenu').remove() && res()));
    // Set the canvas up so its visible
    $('#mainTest').fadeIn();
    const canvas = document.getElementById('mainTest');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Global variables
    const ctx = canvas.getContext('2d');

    // Canvas Utils
    function fadeOutCanvas(text) {
        var alpha = 1.0,   // full opacity
            interval = setInterval(function () {
                canvas.width = canvas.width; // Clears the canvas
                ctx.fillStyle = "rgba(255, 0, 0, " + alpha + ")";
                ctx.font = "italic 20pt Arial";
                ctx.fillText(text, canvas.width / 2, canvas.height / 2);
                alpha = alpha - 0.05; // decrease opacity (fade out)
                if (alpha < 0) {
                    canvas.width = canvas.width;
                    clearInterval(interval);
                }
            }, 50);
    }

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
    }
    /**
 * Allows to obtain the estimated Hz of the primary monitor in the system.
 * 
 * @param {Function} callback The function triggered after obtaining the estimated Hz of the monitor.
 * @param {Boolean} runIndefinitely If set to true, the callback will be triggered indefinitely (for live counter).
 */
    function getScreenRefreshRate(callback, runIndefinitely) {
        let requestId = null;
        let callbackTriggered = false;
        runIndefinitely = runIndefinitely || false;

        if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame;
        }

        let DOMHighResTimeStampCollection = [];

        let triggerAnimation = function (DOMHighResTimeStamp) {
            DOMHighResTimeStampCollection.unshift(DOMHighResTimeStamp);

            if (DOMHighResTimeStampCollection.length > 10) {
                let t0 = DOMHighResTimeStampCollection.pop();
                let fps = Math.floor(1000 * 10 / (DOMHighResTimeStamp - t0));

                if (!callbackTriggered) {
                    callback.call(undefined, fps, DOMHighResTimeStampCollection);
                }

                if (runIndefinitely) {
                    callbackTriggered = false;
                } else {
                    callbackTriggered = true;
                }
            }

            requestId = window.requestAnimationFrame(triggerAnimation);
        };

        window.requestAnimationFrame(triggerAnimation);

        // Stop after half second if it shouldn't run indefinitely
        if (!runIndefinitely) {
            window.setTimeout(function () {
                window.cancelAnimationFrame(requestId);
                requestId = null;
            }, 500);
        }
    }

    // This is in charge of managing data collection
    const store = new (class Storage {
        events = [];

        createUserEntry(data) {
            let compiledData = {
                type: 'user',
                ts: Date.now(),
                display: {
                    hz: data.currentHZ,
                    ball: { position: data.ballPosition, speed: data.ballSpeed },
                }
            };
            console.log("New Update: ", compiledData);
            this.events.push(compiledData);
        };

        createReport(data, previous) {
            let compiledData = {
                type: 'display',
                ts: Date.now(),
                display: {
                    hz: data.currentHZ,
                    ball: { position: data.ballPosition, speed: data.ballSpeed },
                },
                previous: previous,
                current: data.currentHZ
            };
            console.log("New Update: ", compiledData);
            this.events.push(compiledData);
        };

    })();


    // This is in charge of managing test state
    const test = new (class Test {
        // Test length in whole seconds
        testLength = 60;

        // Have we already done a countdown
        countdownState = false;
        end = false;

        // Ball information state
        ballRadius = 50;
        ballSpeed = { x: 2, y: -2 };
        ballPosition = { x: 100, y: 100 };
        ballColor = '#0095DD';

        // The interval in which the ball is updated
        ballMathInterval;

        // Random configuration
        startingHZ = 30;
        maxHZ = 90;
        updateAmount = 15; // Ammount of HZ to update by at random intervals
        includeDecrease = true; // Chance to decrease HZ instead of increase
        decreaseChance = 0.2; // 20% by default
        minimumTime = 4; // Minimum amount of seconds to wait before changing the HZ
        maximumTime = 8; // Maximum amount of seconds to wait before changing the HZ

        // frame information
        currentHZ = 30;

        // The renderer
        renderInterval;

        // Starts the countdown number on the canvas
        async beginCountdown() {
            var that = this;
            if (this.countdownState) return;
            if (debug) return this.end = true && this.onTestComplete();
            await new Promise(res => setTimeout(res, 1000));
            for (let time = 5; time > 0; time--) {
                fadeOutCanvas(time);
                await new Promise(res => setTimeout(res, 1000));
            }
            this.countdownState = true;
            // Do this 1000 times per second
            this.ballMathInterval = setInterval(this.calculateBallMotion.bind(this), 1);

            canvas.onmousedown = (e) => {
                if (that.end) return;
                that.ballColor = 'red';
                store.createUserEntry(that);
            };
            canvas.onmouseup = (e) => {
                if (that.end) return;
                that.ballColor = 'blue';
            };

            this.startBallRendering();
        };

        // Draws the ball at the position, how often this is called will determine the framerate
        draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.arc(this.ballPosition.x, this.ballPosition.y, this.ballRadius, 0, Math.PI * 2);
            ctx.fillStyle = this.ballColor;
            ctx.fill();
            ctx.closePath();
        };

        // Moves the ball, this should be done every tick.
        calculateBallMotion() {
            if (this.ballPosition.x + this.ballSpeed.x > canvas.width - this.ballRadius || this.ballPosition.x + this.ballSpeed.x < this.ballRadius) {
                this.ballSpeed.x = -this.ballSpeed.x;
            }
            if (this.ballPosition.y + this.ballSpeed.y > canvas.height - this.ballRadius || this.ballPosition.y + this.ballSpeed.y < this.ballRadius) {
                this.ballSpeed.y = -this.ballSpeed.y;
            }

            this.ballPosition.x += this.ballSpeed.x;
            this.ballPosition.y += this.ballSpeed.y;
        };

        // Update HZ Speed
        updateHZ(ammount) {
            this.renderInterval ? clearInterval(this.renderInterval) : null;
            this.renderInterval = setInterval(this.draw.bind(this), 1000 / this.currentHZ);
            let previous = this.currentHZ;
            this.currentHZ = ammount;
            store.createReport(this, previous);
        }

        // Starts the test
        async startBallRendering() {
            var that = this;
            var running = true;
            setTimeout(() => running = false, this.testLength * 1000);
            this.updateHZ(this.startingHZ);

            while (running) {
                // Get random time
                await new Promise((res) => setTimeout(res, getRandomInt(that.minimumTime, that.maximumTime) * 1000));
                if (this.includeDecrease && this.currentHZ - this.updateAmount > this.startingHZ) {
                    if (Math.random() < this.decreaseChance) {
                        this.updateHZ(this.currentHZ - this.updateAmount);
                    } else {
                        if (this.currentHZ + this.updateAmount < this.maxHZ) this.updateHZ(this.currentHZ + this.updateAmount);
                    }
                } else {
                    if (this.currentHZ + this.updateAmount < this.maxHZ) this.updateHZ(this.currentHZ + this.updateAmount);
                }
            };

            clearTimeout(this.ballMathInterval);
            clearTimeout(this.renderInterval);
            // ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.end = true;
            this.onTestComplete();
        }

        cb;
        registerOnComplete(callback) {
            this.cb = callback;
        };

        // What to do when the test is complete
        async onTestComplete() {
            await new Promise(res => $('#mainTest').fadeOut(res));
            $('#content').remove();
            if (this.cb) this.cb(this);
        };

    })();

    const stats = new (class Stats {


        constructor() {
            test.registerOnComplete(this.onComplete.bind(this));
        };

        async onComplete() {
            await new Promise(res => $('#testComplete').fadeIn(res));
            if (debug) store.events = [{ "type": "display", "ts": 1643831070964, "display": { "hz": 30, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } }, "previous": 10, "current": 30 }, { "type": "display", "ts": 1643831078965, "display": { "hz": 45, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } }, "previous": 30, "current": 45 }, { "type": "user", "ts": 1643831079444, "display": { "hz": 45, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } } }, { "type": "display", "ts": 1643831085967, "display": { "hz": 60, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } }, "previous": 45, "current": 60 }, { "type": "user", "ts": 1643831086564, "display": { "hz": 60, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } } }, { "type": "display", "ts": 1643831094968, "display": { "hz": 75, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } }, "previous": 60, "current": 75 }, { "type": "user", "ts": 1643831098040, "display": { "hz": 75, "ball": { "position": { "x": 1744, "y": 192 }, "speed": { "x": 2, "y": -2 } } } }];
            await new Promise(res => $('#base-stats-card').fadeIn(res));
            this.renderBasicChart('#base-stats');
            await new Promise(res => $('#timeline-stats-card').fadeIn(res));
            this.renderTimelineChart('#timeline-stats');
            await new Promise(res => $('#settings-card').fadeIn(res));
            const fsettings = {
                TestLength: test.testLength,
                StartingHZ: test.startingHZ,
                MaxHZ: test.maxHZ,
                UpdateHZBy: test.updateAmount,
                AllowHZToDecrease: test.includeDecrease,
                ChanceToDecreaseHZ: test.decreaseChance,
                MinimumTimeBetweenChanges: test.minimumTime,
                MaximumTimeBetweenChanges: test.maximumTime,
            };
            $('#json-renderer').jsonViewer(fsettings);
            await new Promise(res => $('#monitor-hz-card').fadeIn(res));
            $('#detected-hz').text('Loading...')
            getScreenRefreshRate((hz, stats) => $('#detected-hz').text(hz + "hz"), false);
            var exportString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ settings: fsettings, data: store.events }));
            $('#export-results').attr('href', exportString);
        };


        timelineChart;
        renderTimelineChart(id) {
            if (this.timelineChart) return;
            var options = {
                series: [
                    {
                        name: "Display",
                        data: []
                    },
                    {
                        name: "User",
                        data: []
                    }
                ],
                chart: {
                    type: 'rangeBar',
                    height: 350
                },
                plotOptions: {
                    bar: {
                        horizontal: true,
                    }
                },
                xaxis: {
                    type: 'datetime',

                },
                stroke: {
                    width: 1
                },
                fill: {
                    type: 'solid',
                    opacity: 0.6
                },
            };

            const filteredDisplay = store.events.filter(e => e.type == "display");
            options.series[0].data = filteredDisplay.map((d, indx) => ({
                x: d.current + " Hz",
                y: [d.ts, filteredDisplay[indx + 1] ? filteredDisplay[indx + 1].ts : store.events[store.events.length - 1].ts + 1000]
            }));
            const filteredDisplayUser = store.events.filter(e => e.type == "user");
            options.series[1].data = filteredDisplayUser.map((d, indx) => ({
                x: d.display.hz + " Hz",
                y: [d.ts, filteredDisplayUser[indx + 1] ? filteredDisplayUser[indx + 1].ts : store.events[store.events.length - 1].ts + 1000]
            }));

            console.log(options)
            this.timelineChart = new ApexCharts(document.querySelector(id), options);
            this.timelineChart.render();
        };

        basicChart;
        renderBasicChart(id) {
            if (this.basicChart) return;
            var options = {
                chart: {
                    type: 'line',
                    height: 350
                },
                series: [],
                annotations: {
                    xaxis: []
                },
                xaxis: {
                    type: 'datetime'
                },
                stroke: {
                    curve: 'stepline'
                },
                markers: {
                    size: 1,
                }
            };

            options.series.push({
                name: 'Display',
                data: store.events.filter(e => e.type == "display").map(d => ([d.ts, d.current]))
            });
            options.series[0].data.push([store.events[store.events.length - 1].ts, store.events[store.events.length - 1].display.hz]);
            options.annotations.xaxis = store.events.filter(e => e.type == "user").map(d => ({
                x: d.ts, label: {
                    text: 'Clicked', style: {
                        color: "#fff",
                        background: '#775DD0'
                    }
                }
            }));

            console.log(options)
            this.basicChart = new ApexCharts(document.querySelector(id), options);
            this.basicChart.render();
        };

    })();

    // We don't want the user to resize the screen so we cancel the test
    function resizeError() {
        if (test.end) return;
        alert('Please don\'t resize the screen');
        location.reload();
    };

    // Add listeners
    window.addEventListener('resize', resizeError, false);

    // Start the test
    test.beginCountdown();


}