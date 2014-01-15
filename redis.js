var net = require('net');

module.exports = new redisCore();


function redisCore()
{
	var redis   = {};
	var cblist  = [];
	var cbtag   = undefined;
	var cblast  = undefined;//for subscribe
	var data    = new Buffer(0);
	var returnbuffersoption = false;

	//decode state variable
	var itemdata  = undefined;
	var itemleft  = 1;
	var itemerror = undefined;
	var $wait     = false;
	var $length   = 0;

	this.createClient = function(port,host,returnbuffers)
	{
		port = port?port:6379;
		host = host?host:'127.0.0.1';
		var tcp = net.createConnection(port,host);
		tcp.unref();

		if(returnbuffers) returnbuffersoption=true
		else returnbuffersoption=false;

		redis.tag = function(tag) 
		{ 
			cbtag=tag; return redis;
		}
		redis.run = function(/*a1,a2,...an,cb*/)//cb=function(error,result,tag)
		{
			var argu = [];
			for(var i=0;i<arguments.length;i++) argu.push(arguments[i]);

			var cb  = argu[argu.length-1];
			if(typeof(cb)=='function') { argu.pop(); }
			else { cb = function(){}; }
			cb=[cb,cbtag]; cbtag=undefined;//cb=[callback,cbtag]

			var buf = argumentFormat(argu);
			cblist.push(cb);
			try {
				tcp.write(buf);
			}catch(e){
				tcp.emit('error',e);
			}
			return redis;
		}
		redis.end = function()
		{
			return redis.run('quit');
		}
		redis.on = function(name,cb)
		{
			if(name!='connect' && name!='error' && name!='end') throw 'NO THIS LISTENER: '+name;
			tcp.on(name,cb);
			return redis;
		}

		tcp.on('data',function(chunk)
		{
			data = Buffer.concat([data,chunk]);

			while(true)
			{
				var item = DecodeData();
				if(!item) break;
				if(!returnbuffersoption) if(Buffer.isBuffer(item)) item=item.toString();

				if(Array.isArray(itemdata)) itemdata=itemdata.concat(item)
				else itemdata=item[0];


				if(0==itemleft)
				{
					var cb = cblist.shift();
					if(cb) { cblast=cb; } else { cb=cblast; }//cache last cb function, for subscribe
					cb[0](itemerror,itemdata,cb[1]); //cb[0] is callback function, cb[1] is callback tag

					itemdata  = undefined;
					itemleft  = 1;
					itemerror = undefined;
					$wait     = false;
					$length   = 0;
				}
			}
		});
		return redis;
	}

	function DecodeData()
	{
		if($wait)
		{
			if(data.length>=($length+2))
			{
				var ret  = [data.slice(0,$length)];
				data = data.slice($length+2);
				itemleft--;
				$wait = false;
				return ret;
			}
			else return;
		}
		if(data[0]=='$'.charCodeAt(0))
		{
			var str = SplitString(data);
			if(str)
			{
				$length = parseInt(str);
				//This is called a NULL Bulk Reply.The client library API should not return an empty string, but a nil object.
				if(-1==$length) { itemleft--; return [null]; } //$-1\r\n
				else { $wait=true; return []; }
			}
			else return;
		}
		if(data[0]=='+'.charCodeAt(0))
		{
			var str = SplitString(data);
			if(str) {itemleft--; return [str];}
			else return;
		}
		if(data[0]==':'.charCodeAt(0))
		{
			var str = SplitString(data);
			if(str) {itemleft--; return [parseInt(str)];}
			else return;
		}
		if(data[0]=='-'.charCodeAt(0))
		{
			var str = SplitString(data);
			if(str) {itemerror=str; itemleft--; return [new Error(str)];}
			else return;
		}
		if(data[0]=='*'.charCodeAt(0))
		{
			var str = SplitString(data);
			if(str) 
			{
				itemleft = parseInt(str);
				//A client library API should return a null object and not an empty Array when Redis replies with a Null Multi Bulk Reply. 
				if(-1==itemleft) { itemleft=0; return [null]; } //*-1\r\n
				else { itemdata=[]; return []; }
			}
			else return;
		}
	}

	function SplitString()
	{
		var index = IndexOfBuffer(data,'\r\n');
		if(index>=0) 
		{
			var ret = data.slice(1,index).toString();
			data = data.slice(index+2);
			return ret;
		}
	}

	function IndexOfBuffer(buffer, sub)
	{
		if(!Buffer.isBuffer(sub)) sub = new Buffer(sub);
		for(var i=0;i<buffer.length;i++)
		{
			var flag = true;
			for(var j=0;j<sub.length;j++)
				if(buffer[i+j]!==sub[j]) { flag=false; break; }
			if(flag) return i;
		}
		return -1;
	}
}

function argumentFormat(argu)
{
	var count = argu.length;
	if(count<=0) throw 'NO ARGUMENTS';

	var list = []
	var cmd = '*'+count+'\r\n';
	list.push(new Buffer(cmd));

	for(var i=0;i<count;i++)
	{
		var argv = argu[i];
		if(!Buffer.isBuffer(argv)) argv=''+argv;

		cmd = '$'+argv.length+'\r\n';
		list.push(new Buffer(cmd));
		
		list.push(new Buffer(argv));
		cmd = '\r\n';
		list.push(new Buffer(cmd));
	}
	return Buffer.concat(list);
}