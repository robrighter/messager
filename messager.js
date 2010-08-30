(function(){
  
  var events = require('events');
  var sys = require('sys');
  var initialStatus = 40;
  
  
  sys.inherits(Messager, events.EventEmitter);
  function Messager(socketio, cookiename){
    var tickmessageuid = 0;
    var tickList = {};
    var staleSessions = {};
    var activeSessions = {};
    var cookieRegExp = new RegExp(cookiename + '=([^;]+)');
    events.EventEmitter.call(this);
    var io = socketio;
    var that = this;
    
    
    this.doPersonalMessage = function(client, command, value){
      console.log('sending: ' + command);
      client.send(JSON.stringify([{
         'type': 'personal'
        ,'command': command
        ,'value': value 
      }]));
    }
    
    this.appendPublicMessage = function(command, value){
      this.replacePublicMessage('append_' + (tickmessageuid++) , command, value)
    }
    
    this.replacePublicMessage = function(key, command, value){
      tickList[key] = {
        'timestamp': Date.now()
        ,'type': 'public'
        ,'command': command
        ,'value': value 
      };
    }
    
    io.on('connection', function(client){
      var match =  client.request.headers.cookie.match(cookieRegExp);
      if(match){
        console.log('Client ('+match[1]+') Connected. With a socket.io client id of: ' + client.sessionId);
        if(staleSessions.hasOwnProperty(match[1])){
          //this is a stale user reconnecting so lets revive them before they die
          var thesession = staleSessions[match[1]];
          delete staleSessions[match[1]];
          thesession['status'] = initialStatus;
          activeSessions[match[1]] = thesession;
          that.emit('user-reconnect', thesession, client);
        }
        else{
          //new user
          var thesession = activeSessions[match[1]] =  {
            'status': initialStatus
            ,'id': match[1]
          }
          that.emit('new-user', thesession, client);
        }
        client.on('disconnect', function(){
          delete activeSessions[thesession.id];
          staleSessions[thesession.id] = thesession;
          that.emit('user-disconnect', thesession, client);
        });
        client.on('message', function(message){
          message = JSON.parse(message);
          if(message.hasOwnProperty('cmd')){
            that.emit(message['cmd'], (new Date()).getTime(), message, tickList, client, thesession);
          }
        });
        
      }
      else{
        //this should not be happening, so lets act like it didnt
        console.log('Error: Recieved a socketIO connection, but the user has no cookie.');
      } 
      
    });
    
    //Kick off the ticker:
    setInterval(function(){
      messageTick();
      sessionTick();
    }, 300);
    
    function messageTick(){
      tickmessageuid = 0;
      //sort the tickList by timestamp
      var tosort = Array();
      for(key in tickList){
        if(tickList[key].hasOwnProperty('timestamp')){
          tosort.push(tickList[key]);
        }
      }
      if (tosort.length > 0) {
          tosort = tosort.sort(function(a,b){ return (b['timestamp']<a['timestamp']);});
          //send out the messages for this tick
          io.broadcast(JSON.stringify(tosort));
          console.log('sending: ' + sys.inspect(tosort));
      }
      //reset the ticklist for the next round
      tickList = {};  
    }
    
    function sessionTick(){
      for(key in staleSessions){
        var s = staleSessions[key];
        if(s['status']-- == 0){
          delete staleSessions[key];
          that.emit('destroy-user', s);
        }
      }
    }
      
    
  };
  
  exports.Messager = Messager;
})();