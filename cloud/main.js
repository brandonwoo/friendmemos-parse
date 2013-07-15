
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:
//Parse.Cloud.define("hello", function(request, response) {
//  response.success("Hello world!");
//});

//require('cloud/app.js');

Parse.Cloud.define('initialize', function(req, res){
  var user = req.user;
  res.success({
    userItems: []
  });
});

Parse.Cloud.beforeSave('FbMemo', function(req, res){
  if (req.object.get('appUserId') != Parse.User.current().id) {
    return res.reject('cant save memo for another user');
  }
  res.success();
});