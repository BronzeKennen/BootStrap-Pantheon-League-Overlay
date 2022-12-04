const WsSubscribers = {
    __subscribers: {},
    websocket: undefined,
    webSocketConnected: false,
    registerQueue: [],
    init: function(port, debug, debugFilters) {
        port = port || 49322;
        debug = debug || false;
        if (debug) {
            if (debugFilters !== undefined) {
                console.warn("WebSocket Debug Mode enabled with filtering. Only events not in the filter list will be dumped");
            } else {
                console.warn("WebSocket Debug Mode enabled without filters applied. All events will be dumped to console");
                console.warn("To use filters, pass in an array of 'channel:event' strings to the second parameter of the init function");
            }
        }
        WsSubscribers.webSocket = new WebSocket("ws://localhost:" + port);
        WsSubscribers.webSocket.onmessage = function (event) {
            let jEvent = JSON.parse(event.data);
            if (!jEvent.hasOwnProperty('event')) {
                return;
            }
            let eventSplit = jEvent.event.split(':');
            let channel = eventSplit[0];
            let event_event = eventSplit[1];
            if (debug) {
                if (!debugFilters) {
                    console.log(channel, event_event, jEvent);
                } else if (debugFilters && debugFilters.indexOf(jEvent.event) < 0) {
                    console.log(channel, event_event, jEvent);
                }
            }
            WsSubscribers.triggerSubscribers(channel, event_event, jEvent.data);
        };
        WsSubscribers.webSocket.onopen = function () {
            WsSubscribers.triggerSubscribers("ws", "open");
            WsSubscribers.webSocketConnected = true;
            WsSubscribers.registerQueue.forEach((r) => {
                WsSubscribers.send("wsRelay", "register", r);
            });
            WsSubscribers.registerQueue = [];
        };
        WsSubscribers.webSocket.onerror = function () {
            WsSubscribers.triggerSubscribers("ws", "error");
            WsSubscribers.webSocketConnected = false;
        };
        WsSubscribers.webSocket.onclose = function () {
            WsSubscribers.triggerSubscribers("ws", "close");
            WsSubscribers.webSocketConnected = false;
        };
    },
    /**
    * Add callbacks for when certain events are thrown
    * Execution is guaranteed to be in First In First Out order
    * @param channels
    * @param events
    * @param callback
    */
    subscribe: function(channels, events, callback) {
        if (typeof channels === "string") {
            let channel = channels;
            channels = [];
            channels.push(channel);
        }
        if (typeof events === "string") {
            let event = events;
            events = [];
            events.push(event);
        }
        channels.forEach(function(c) {
            events.forEach(function (e) {
                if (!WsSubscribers.__subscribers.hasOwnProperty(c)) {
                    WsSubscribers.__subscribers[c] = {};
                }
                if (!WsSubscribers.__subscribers[c].hasOwnProperty(e)) {
                    WsSubscribers.__subscribers[c][e] = [];
                    if (WsSubscribers.webSocketConnected) {
                        WsSubscribers.send("wsRelay", "register", `${c}:${e}`);
                    } else {
                        WsSubscribers.registerQueue.push(`${c}:${e}`);
                    }
                }
                WsSubscribers.__subscribers[c][e].push(callback);
            });
        })
    },
    clearEventCallbacks: function (channel, event) {
        if (WsSubscribers.__subscribers.hasOwnProperty(channel) && WsSubscribers.__subscribers[channel].hasOwnProperty(event)) {
            WsSubscribers.__subscribers[channel] = {};
        }
    },
    triggerSubscribers: function (channel, event, data) {
        if (WsSubscribers.__subscribers.hasOwnProperty(channel) && WsSubscribers.__subscribers[channel].hasOwnProperty(event)) {
            WsSubscribers.__subscribers[channel][event].forEach(function(callback) {
                if (callback instanceof Function) {
                    callback(data);
                }
            });
        }
    },
    send: function (channel, event, data) {
        if (typeof channel !== 'string') {
            console.error("Channel must be a string");
            return;
        }
        if (typeof event !== 'string') {
            console.error("Event must be a string");
            return;
        }
        if (channel === 'local') {
            this.triggerSubscribers(channel, event, data);
        } else {
            let cEvent = channel + ":" + event;
            WsSubscribers.webSocket.send(JSON.stringify({
                'event': cEvent,
                'data': data
            }));
        }
    }
};


///
/*
    game:replay_start
    game:replay_end
    game:pre_countdown_begin
    game:post_countdown_begin
    game:statfeed_event
    game:goal_scored
*/


function getValue(){
    var value= $.ajax({ 
        url: 'livematch.json', 
        async: false
    }).responseText;

    return JSON.parse(value);
}

function percentageToDegrees(percentage) {

    return percentage / 100 * 360;

}

function getTeams(i){
    var value= $.ajax({ 
        url: 'https://cwxskbsjnovkyqeloumw.supabase.co/rest/v1/rpc/getteams',
        async: false,
        headers: {'Content-Type': 'application/json', 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3eHNrYnNqbm92a3lxZWxvdW13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjMyNDgzODYsImV4cCI6MTk3ODgyNDM4Nn0.NtKg2p6BHRBbpm4FM0cAGA5lWWGkjWyt-oyvsQfZI_E', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3eHNrYnNqbm92a3lxZWxvdW13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjMyNDgzODYsImV4cCI6MTk3ODgyNDM4Nn0.NtKg2p6BHRBbpm4FM0cAGA5lWWGkjWyt-oyvsQfZI_E'}
    }).responseText;

    return JSON.parse(value);
}

$(() => {
    // $('body').hide();
    WsSubscribers.init(49322, true);
    $('.replay-cam').hide();
    for(let i = 0; i<5;i++) {
        $(`.series-score #orange${i}`).hide();
        $(`.series-score #blue${i}`).hide();
    }
    //GET TEAM NAMES/LOGOS FROM DATABASE
    var in_replay = 0;
    var scorer = 'none';
    var scorer_attr;
    var speed;
    var blue_team_logo;
    var orange_team_logo;
    var teams = getTeams();
    var livematches = getValue();
    //GET CURRENT ACTIVE MATCH FROM CHALLONGE
    //note: next up needs to be added
    for(let i = 0; i < 4; i++) {
        if (livematches[i]["active"] === 1) {
            livematch = livematches[i];
        }
    }

    //GET CURRENT MATCH TEAM LOGOS
    for(let i = 0; i < teams.length; i++) {
        if(teams[i]['name'] === livematch["blue_team"]["display_name"]) {
            blue_team_logo = teams[i]['logo'];            
        } else if (teams[i]['name'] === livematch['orange_team']['display_name']){
            orange_team_logo = teams[i]['logo'];
        }
    }

    WsSubscribers.subscribe("game", "update_state", (d) => {
        //----------------SCOREBUG TEXTS/LOGOS----------------------
        
        $(".scorebug .scorebug-table #team1-score").text(d['game']['teams'][0]['score']);
        $(".scorebug .scorebug-table #team2-score").text(d['game']['teams'][1]['score']);
        $(".scorebug .scorebug-table #blue").text(livematch["blue_team"]["display_name"].toUpperCase());
        $(".scorebug .scorebug-table #orange").text(livematch["orange_team"]["display_name"].toUpperCase());
        $(".scorebug #blue-team").attr("src", blue_team_logo);
        $(".scorebug #orange-team").attr("src", orange_team_logo);

        //TIME CALCULATION
        var gtime = Math.floor(Math.ceil(d.game.time_seconds) / 60);
        var gsecs = Math.ceil(Math.ceil(d.game.time_seconds) % 60);
        if (gsecs < 10)
            gsecs = "0" + gsecs;
        if (d.game.isOT)
            $(".scorebug .scorebug-table #time").text("+" + gtime + ":" + gsecs);
        else 
            $(".scorebug .scorebug-table #time").text(gtime + ":" + gsecs);


        //SERIES SCORE
        var bo = 5; //SET TO 7 IF THE SERIES IS BO7
        if (bo === 5) {
            //HIDE EXTRA DOTS IF BO5
            $('#bo').text("BO5");
            $('.series-score #blue1').hide();
            $('.series-score #orange4').hide();
            $('.series-score .empty-blue').css("background","none");
            $('.series-score .empty-orange').css("background","none");
        }
        var series_score = livematch["scores_csv"];
        series_score = series_score.split("-");
        //SHOWS DOTS BASED ON SERIES SCORE
        for(let i = 0; i < series_score[0]; i++) {
            $(`.series-score #blue${4-i}`).show();
        }
        for(let i = 0; i < series_score[1]; i++) {
            $(`.series-score #orange${i+1}`).show();
        }
        

        //BOOST BARS
        for(let player in d.players) {
            //BLUE TEAM
            if(d['players'][player]['id'].charAt(d['players'][player]['id'].length - 1) === '1') {
                $('.boosts .blue-boost #b-name-1').text(d['players'][player]['name'].toUpperCase());
                $('.boosts .blue-boost #b-num-1').text(d['players'][player]['boost']);
                $('#b-b-bar-1 .progress-bar').width(d['players'][player]['boost'] + "%");
            } else if(d['players'][player]['id'].charAt(d['players'][player]['id'].length - 1) === '2') {
                $('.boosts .blue-boost #b-name-2').text(d['players'][player]['name'].toUpperCase());
                $('.boosts .blue-boost #b-num-2').text(d['players'][player]['boost']);
                $('#b-b-bar-2 .progress-bar').width(d['players'][player]['boost'] + "%");
            } else if(d['players'][player]['id'].charAt(d['players'][player]['id'].length - 1) === '3') {
                $('.boosts .blue-boost #b-name-3').text(d['players'][player]['name'].toUpperCase());
                $('.boosts .blue-boost #b-num-3').text(d['players'][player]['boost']);
                $('#b-b-bar-3 .progress-bar').width(d['players'][player]['boost'] + "%");
            } 
            //ORANGE TEAM
            else if(d['players'][player]['id'].charAt(d['players'][player]['id'].length - 1) === '5') {
                $('.boosts .orange-boost #o-name-1').text(d['players'][player]['name'].toUpperCase());
                $('.boosts .orange-boost #o-num-1').text(d['players'][player]['boost']);
                $('#o-b-bar-1 .progress-bar').width(d['players'][player]['boost'] + "%");
            } else if(d['players'][player]['id'].charAt(d['players'][player]['id'].length - 1) === '6') {
                $('.boosts .orange-boost #o-name-2').text(d['players'][player]['name'].toUpperCase());
                $('.boosts .orange-boost #o-num-2').text(d['players'][player]['boost']);
                $('#o-b-bar-2 .progress-bar').width(d['players'][player]['boost'] + "%");
            } else if(d['players'][player]['id'].charAt(d['players'][player]['id'].length - 1) === '7') {
                $('.boosts .orange-boost #o-name-3').text(d['players'][player]['name'].toUpperCase());
                $('.boosts .orange-boost #o-num-3').text(d['players'][player]['boost']);
                $('#o-b-bar-3 .progress-bar').width(d['players'][player]['boost'] + "%");
            }
        }

        if(scorer != 'none' ) {
            $(`.replay-cam .stats #saves`).text(d['players'][scorer]['saves']);
            $(`.replay-cam .stats #goals`).text(d['players'][scorer]['goals']);
            $(`.replay-cam .stats #assists`).text(d['players'][scorer]['assists']);
            $(`.replay-cam .stats #shots`).text(d['players'][scorer]['shots']);
        }   
        if (d.game.target !== "") {
            //PLAYER CARD
            $('.focus-player #focus-player-name').text(d['players'][d['game']['target']]['name'].toUpperCase())
            let stats = ['goals' ,'assists', 'shots', 'saves', 'demos', 'touches'];
            stats.forEach((item) => {
                $(`.focus-player .focus-stats #${item}`).text(d['players'][d['game']['target']][item]);
            });

            if (in_replay === 0) {
                $('.focus-player .player-card').show();
            }
            if ((d['players'][d['game']['target']]['team']) === 0) {
                $('.focus-player .player-card').css('background-image', "url('Assets/target-player-blue.png')");
                $('.focus-player .focus-stats').css('color', 'white');
                $('.focus-player #focus-player-name').css('color', 'white');
                $('.focus-player #focus-player-team').attr('src', blue_team_logo);
            } else  {
                $('.stats').css('color', 'white');
                $('.focus-player .player-card').css('background-image', "url('Assets/target-player-orange.png')");
                $('.focus-player .focus-stats').css('color', 'black');
                $('.focus-player #focus-player-team').attr('src', orange_team_logo);
            }

        } else {
            $('.focus-player .player-card').hide();
        }

    $('body').show();
    });

    WsSubscribers.subscribe("game", "goal_scored", (d) => {
        scorer = d['scorer']['id'];
        speed = parseInt(d['goalspeed']);
        scorer_attr = scorer.split('_');
        if (scorer_attr[1] < 4) {
            $('.replay-cam').css('background',"url('Assets/BLUE_REPLAY_CARD_ASSISTS.png')");
            $('.replay-cam').css('background-size', '100%');
            $('.replay-cam .stats').css('color','white');
            $('.replay-cam #speed').css('color','white');
        } else {
            $('.replay-cam').css('background',"url('Assets/ORANGE_REPLAY_CARD_ASSISTS.png')");
            $('.replay-cam').css('background-size', '100%');
            $('.replay-cam .stats').css('color','black');
            $('.replay-cam #speed').css('color','black');
        }
        setTimeout(() => {
            $('#stinger').trigger('play');
        },3200);
        //Add stinger!
    });

    WsSubscribers.subscribe("game", "replay_start", (d) => {
        in_replay = 1;
        $('.orange-boost').hide();
        $('.blue-boost').hide();
        $('.player-card').hide();
        $('.replay-cam').show();
        $('.replay-cam #scorer-playmaker #scorer').text(scorer_attr[0].toUpperCase());
        $('.replay-cam #speed').text(speed);
        
    });

    WsSubscribers.subscribe("game", "replay_will_end", (d) => {
        setTimeout(() => {
            $('#stinger').trigger('play');
        },2000);

    });

    WsSubscribers.subscribe("game", "replay_end", (d) => {
        in_replay = 0;
        $(".player-card").show();
        $(".replay-cam").hide();
        $('.orange-boost').show();
        $('.blue-boost').show();
    });

    WsSubscribers.subscribe("game", "statfeed_event", (d) => {
        
    });
});
