var redis = require('./redis.js');

var client = redis.createClient(6379,'127.0.0.1');

client.on('connect',function()
{
	console.log('connect');
});
client.on('error',function(err)
{
	console.log('Error: '+err);
});
client.on('end',function()
{
	console.log('END');
});


function cb(err,result,tag)
{
	console.log(tag+': '+ result);
}

client.tag('cmd1').run('set','aa','11',cb);
client.run('incr','aa',cb);
client.tag('cmd2').run('get','aa',cb);

