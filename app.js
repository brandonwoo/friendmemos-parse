//local web server for running and testing app locally
var express = require('express')
  , app = express()
  , path = require('path')
;

app.use(express.static(process.cwd()+'/public'));
app.listen('3000');
console.log('app listening on port 3000');