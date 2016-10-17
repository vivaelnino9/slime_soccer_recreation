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

var frameRate = 1/50; // Seconds
var frameDelay = frameRate * 1000; // ms

var Cd = 0.47;  // Dimensionless
var rho = 1.22; // kg / m^3
var ag = 9.81;  // m / s^2

var Entity = function(param){
  var self = {
  		x:0,
  		y:0,
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
//player
var Player = function(param){
	var self = Entity(param);
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
// Player.onConnect = function(socket){//
Player.onConnect = function(socket,ball){
  // When player connects, create player and ball
	var player = Player({
		id:socket.id,
    x:140,
    y:HEIGHT,
	});
  // var ball = Ball({//
  //   x:(WIDTH/2),
  //   y:(15),
  // })
  socket.on('keyPress',function(data){
		if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'up')
      player.pressingUp = data.state;
		else if(data.inputId === 'down')
			player.pressingDown = data.state;
	});
  socket.emit('init',{
		selfId:socket.id,
		player:Player.getAllInitPack(),
    // ball:Ball.getAllInitPack(),//
    ball:startBall(ball),
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
// ball
var Ball = function(param){
  var self = Entity(param);
	self.id = Math.random();
  self.mass = 0.1; //.1
  self.radius = 15; //15
  self.restitution = -.9; //-1
  self.A = Math.PI * self.radius * self.radius / (10000);
  // self.spdX = -20;
  self.above = false;
  self.L_goal = false;
  self.R_goal = false;

  var super_update = self.update;
	self.update = function(){
		super_update();
    for(var i in Player.list){
			var p = Player.list[i];
			if( (self.getDistance(p) < (p.radius + self.radius)) && (p.y > (self.y - self.radius)) ){
        // if the ball hits the player
        if(self.x < (p.x - 15)){
        // if the ball hits the left side of the player
          self.spdX = -(Math.abs(self.spdX) + 2);
          if(self.x > (p.x - 35))
            self.spdY = -(Math.abs(self.spdY) + .6);
          else if(self.x < (p.x - 35))
            self.spdY = -(Math.abs(self.spdY) + .1);
        }
        else if(self.x > (p.x + 15)){
        // if the ball hits the right side of the player
          self.spdX = (Math.abs(self.spdX) + 2);
          if(self.x < (p.x + 35))
            self.spdY = -(Math.abs(self.spdY) + .6);
          else if(self.x > (p.x + 35))
            self.spdY = -(Math.abs(self.spdY) + .1);
        }
        else
          self.spdY = -(Math.abs(self.spdY) + .4);

        self.spdY = -(Math.abs(self.spdY) + .4);
			}
		}
  }

	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
		};
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
		};
	}
  self.physics = function(){
    // Apply ball physics
    // Drag force: Fd = -1/2 * Cd * A * rho * v * v
    var Fx = -0.5 * Cd * self.A * rho * self.spdX * self.spdX * self.spdX / Math.abs(self.spdX);
    var Fy = -0.5 * Cd * self.A * rho * self.spdY * self.spdY * self.spdY / Math.abs(self.spdY);

    Fx = (isNaN(Fx) ? 0 : Fx);
    Fy = (isNaN(Fy) ? 0 : Fy);

    // Calculate acceleration ( F = ma )
    var ax = Fx / self.mass;
    var ay = ag + (Fy / self.mass);

    // Integrate to get velocity
    self.spdX += ax*frameRate;
    self.spdY += ay*frameRate;

    // Integrate to get position
    self.x += self.spdX*frameRate*100;
    self.y += self.spdY*frameRate*100;

    // Handle collisions
    var left_goal ={
      x:55,
      y:(HEIGHT-110),
      goal:false,
    }
    var right_goal ={
      x:(WIDTH-55),
      y:left_goal.y,
      goal:false,
    }

    if(self.L_goal){
    //Ball in left goal
      if((self.x + self.radius) > left_goal.x)
        self.spdX = -(Math.abs(self.spdX));
      if((self.y - self.radius) < left_goal.y)
        self.spdY = Math.abs(self.spdY);
    }
    if(self.R_goal){
    //Ball in right goal
      if((self.x - self.radius) < right_goal.x)
        self.spdX = Math.abs(self.spdX);
      if((self.y - self.radius) < right_goal.y)
        self.spdY = Math.abs(self.spdY);
    }
    if (self.y < self.radius){
    // Ball hitting the ceiling
      self.spdY *= self.restitution;
      self.y = self.radius;
    }
    if (self.y > HEIGHT - self.radius) {
    // Ball hitting the floor
      self.spdY *= self.restitution;
      self.y = HEIGHT - self.radius;
    }
    if (self.x > WIDTH - self.radius) {
    // Ball hitting the right wall
      self.spdX *= self.restitution;
      self.x = WIDTH - self.radius;
    }
    if (self.x < self.radius) {
    // Ball hitting the left wall
      self.spdX *= self.restitution;
      self.x = self.radius;
    }
    if(self.getDistance(left_goal)<15){
      // Ball hitting left crossbar
      self.spdX=Math.abs(self.spdX);
    }
    if(self.getDistance(right_goal)<15){
      // Ball hitting right crossbar
      self.spdX=-(Math.abs(self.spdX));
    }
    if (self.x < left_goal.x || self.x > right_goal.x){
    // Ball left of left_goal OR right of right_goal
      if((self.y + self.radius) < left_goal.y){
      // Ball above either goal
        if(!self.above){
          self.above=true;
        }
      }
      if((self.y + self.radius) > left_goal.y){
        if(!self.above){
          // Ball in either goal
          ag=0; //zero gravity
          self.goal=true;
          if(self.x < left_goal.x)
          // Ball in left goal
            self.L_goal=true;
          else
          // Ball in right goal
            self.R_goal=true;
          for(var i in SOCKET_LIST){
          // Emit goal message to both players
        		var socket = SOCKET_LIST[i];
            socket.emit('Goal');
          }
        }
        else{
          // Ball hitting top of goal
          self.spdY *= self.restitution;
          self.y = left_goal.y - self.radius;
        }
      }
    }
    if((self.x+self.radius)>left_goal.x && (self.x+self.radius) < right_goal.x){
      // Ball not above either goal
      self.above=false;
    }



  }

  // Ball.list[self.id] = self;//
  // initPack.ball.push(self.getInitPack());//
	return self;
}
// Ball.list = {};//
var ball = Ball({
  x:(WIDTH/2),
  y:15,
})
startBall = function(ball){
	var pack = [];
	pack.push(ball.getInitPack());
	return pack;
}
updateBall = function(){
  var pack = [];
  ball.physics();
	ball.update();
	pack.push(ball.getUpdatePack());
	return pack;
}

// Ball.update = function(){//
// 	var pack = [];
// 	for(var i in Ball.list){
// 		var ball = Ball.list[i];
//     ball.physics();
// 		ball.update();
// 		pack.push(ball.getUpdatePack());
// 	}
// 	return pack;
// }

Ball.getAllInitPack = function(){
	var ball = [];
	for(var i in Ball.list)
		ball.push(Ball.list[i].getInitPack());
	return ball;
}

var DEBUG = true;

var isValidPassword = function(data,cb){
	// Check database for username and password
	db.account.find({username:data.username,password:data.password},function(err,res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});
}
var isUsernameTaken = function(data,cb){
	// Check database to see is username already exists
	db.account.find({username:data.username},function(err,res){
		if(res.length > 0 || data.username === "" )
			cb(true);
		else
			cb(false);
	});
}
var addUser = function(data,cb){
	// Add username and password to database
	db.account.insert({username:data.username,password:data.password},function(err){
		cb();
	});
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
    // When server is started, create a socket id number
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;
    socket.on('signIn',function(data){
    // When player tries to sign in, check username and password
  		isValidPassword(data,function(res){
  			if(res){
          // If successul signin, connect the player and give it socket id
  				// Player.onConnect(socket);
          Player.onConnect(socket,ball);
  				socket.emit('signInResponse',{success:true,username:data.username,});
  			} else {
          // If unsuccessul, tell player signin was unsuccessul
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
});

var initPack = {player:[],ball:[],};
var removePack = {player:[],};

initPack.ball.push(ball.getInitPack());
setInterval(function(){
  var pack = {
    player:Player.update(),
    // ball:Ball.update(),//
    ball:updateBall(),
  }
  for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('init',initPack);
		socket.emit('update',pack);
		socket.emit('remove',removePack);
	}

  initPack.player = [];
	removePack.player = [];
  initPack.ball = [];

},35);
