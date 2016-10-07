var mongojs = require('mongojs');
var db = mongojs('mongodb://lucas:rooney10@ds053166.mlab.com:53166/slimesoccer', ['account']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/',function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Server started.");

var SOCKET_LIST = {};

var WIDTH = 1400;
var HEIGHT = 600;

var Entity = function(param){
	var self = {
		x:140,
		y:HEIGHT,
		spdX:0,
		spdY:0,
		id:"",
	}
	if(param){
		if(param.x)
			self.x = param.x;
		if(param.y)
			self.y = param.y;
		if(param.id)
			self.id = param.id;
	}

	self.update = function(){
		self.updatePosition();
	}
	self.updatePosition = function(){
		self.x += self.spdX;
		self.y += self.spdY;
	}
	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
	}
	return self;
}

var Player = function(param){
	var self = Entity(param);
	self.number = "" + Math.floor(10 * Math.random());
  self.radius = 55;
	self.pressingRight = false;
	self.pressingLeft = false;
	self.pressingUp = false;
	self.pressingDown = false;
	self.maxSpd = 10;
	self.score = 0;

  var super_update = self.update;
	self.update = function(){
		self.updateSpd();

		super_update();
	}

  self.updateSpd = function(){
		if(self.pressingRight && self.x + self.maxSpd < WIDTH - self.radius)
			self.spdX = self.maxSpd;
		else if(self.pressingLeft && self.x - self.maxSpd > self.radius)
      self.spdX = -self.maxSpd;
		else
			self.spdX = 0;

		if(self.pressingUp && self.y - self.maxSpd > self.radius)
			self.spdY = -self.maxSpd;
		else if(self.pressingDown && self.y + self.maxSpd < HEIGHT + 1)
			self.spdY = self.maxSpd;
		else
			self.spdY = 0;
	}

  self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			score:self.score,
		};
	}
  self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			score:self.score,
		};
	}

  Player.list[self.id] = self;

	initPack.player.push(self.getInitPack());
  return self;
}
Player.list = {};
Player.onConnect = function(socket){
	var player = Player({
		id:socket.id,
	});
  socket.on('keyPress',function(data){
		if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'up')
			player.pressingUp = data.state;
		else if(data.inputId === 'down')
			player.pressingDown = data.state;
		else if(data.inputId === 'attack')
			player.pressingAttack = data.state;
		else if(data.inputId === 'mouseAngle')
			player.mouseAngle = data.state;
	});

  socket.emit('init',{
		selfId:socket.id,
		player:Player.getAllInitPack(),
	})
}
Player.getAllInitPack = function(){
	var players = [];
	for(var i in Player.list)
		players.push(Player.list[i].getInitPack());
	return players;
}

Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
	removePack.player.push(socket.id);
}
Player.update = function(){
	var pack = [];
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		pack.push(player.getUpdatePack());
	}
	return pack;
}

// var DEBUG = true;

var isValidPassword = function(data,cb){
	// return cb(true);
	db.account.find({username:data.username,password:data.password},function(err,res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});
}
var isUsernameTaken = function(data,cb){
	// return cb(false);

	db.account.find({username:data.username},function(err,res){
		if(res.length > 0 || data.username === "" )
			cb(true);
		else
			cb(false);
	});
}
var addUser = function(data,cb){
	// return cb();
	db.account.insert({username:data.username,password:data.password},function(err){
		cb();
	});
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;
    socket.on('signIn',function(data){
  		isValidPassword(data,function(res){
  			if(res){
  				Player.onConnect(socket);
  				socket.emit('signInResponse',{success:true,username:data.username,});
  			} else {
  				socket.emit('signInResponse',{success:false});
  			}
  		});
	});
	socket.on('signUp',function(data){
		isUsernameTaken(data,function(res){
			if(res){
				socket.emit('signUpResponse',{success:false});
			} else {
				addUser(data,function(){
					socket.emit('signUpResponse',{success:true});
				});
			}
		});
	});

    socket.on('disconnect',function(){
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });
    // socket.on('sendMsgToServer',function(data){
  	// 	for(var i in SOCKET_LIST){
  	// 		SOCKET_LIST[i].emit('addToChat',data.name + ': ' + data.value);
  	// 	}
  	// });

    // socket.on('keyPress',function(data){
    //     if(data.inputId === 'left')
    //         player.pressingLeft = data.state;
    //     else if(data.inputId === 'right')
    //         player.pressingRight = data.state;
    //     else if(data.inputId === 'jump')
    //         player.jump = data.state;
    //     else if(data.inputId === 'up')
    //         player.pressingUp = data.state;
    //     else if(data.inputId === 'down')
    //         player.pressingDown = data.state;
    // });

});

var initPack = {player:[],};
var removePack = {player:[],};

setInterval(function(){
  var pack = {
    player:Player.update(),
  }

  for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('init',initPack);
		socket.emit('update',pack);
		socket.emit('remove',removePack);
	}

  initPack.player = [];
	removePack.player = [];

},1000/25);
