var app = angular.module('friendmemos', [
    'infinite-scroll'
  ])
  .config([
    '$routeProvider',
    function ($routeProvider) {
      $routeProvider.when('/home', {
        templateUrl: 'partials/home.html',
        controller: HomeCtrl,
        resolve: HomeCtrl.resolve
      }).when('/friends/:uid', {
        templateUrl: 'partials/memo.html',
        controller: MemoCtrl,
        resolve: MemoCtrl.resolve
      }).when('/login', {
        templateUrl: 'partials/login.html',
        controller: LoginCtrl
      }).when('/logout', {
        templateUrl: 'partials/logout.html',
        controller: LogoutCtrl
      }).otherwise({ redirectTo: '/home' });
    }
  ])
  .run(function ($rootScope, $http, $window, $location) {

    var Parse = $window.Parse;

    // gripe if it's not there.
    if(!Parse) throw new Error('Parse not loaded');

    //make sure FB is initialized.
    Parse.FacebookUtils.init({
      appId      : FACEBOOK_APP_ID,
      channelUrl : '/channel.html', // Channel file for x-domain comms
      cookie     : true // enable cookies to allow Parse to access the session
    });
  });
;
var FRIEND_SEARCH_RESULTS_LIMIT = 10;
var INFINITE_SCROLL_ITEMS_PER_BATCH = 20;

var FbMemo = Parse.Object.extend('FbMemo');

function HomeCtrl($scope, fbFriends, $location, $rootScope) {
  if (!Parse.User.current()) {
    return $location.path("/login");
  }

  $scope.pageName = 'Friends';
  var previousQueryStringLength = 0;
  var previousResults = [];
  
  $scope.$watch('query', function () {
    if ($scope.query) {
      var lowerCaseQueryString = $scope.query.toLowerCase();
    } else {
      lowerCaseQueryString = '';
    }
    if (lowerCaseQueryString) {
      $scope.showMainList = false;
    } else {
      $scope.showMainList = true;
      return;
    }
    if (lowerCaseQueryString.length < previousQueryStringLength) {
      var friends = previousResults;
      var results = _searchForFriends(lowerCaseQueryString, friends, FRIEND_SEARCH_RESULTS_LIMIT);
      $scope.searchListResults = _.first(results, FRIEND_SEARCH_RESULTS_LIMIT);
      previousResults = results;
    } else {
      
      var results = _searchForFriends(lowerCaseQueryString, fbFriends, FRIEND_SEARCH_RESULTS_LIMIT);
      $scope.searchListResults = _.first(results, FRIEND_SEARCH_RESULTS_LIMIT);
      
      previousResults = results;
    }
  });
  
  var index = 0;
  $scope.loadMore = function () {
    if (!$scope.friends) {
      $scope.friends = [];
    }
    for (var i = 0; i < INFINITE_SCROLL_ITEMS_PER_BATCH; i++) {
      if (!fbFriends || !fbFriends[index]) { //empty fb friend list or all fb friends looped
        break;
      }
      $scope.friends.push(fbFriends[index]);
      index++;
    }
  }
}
HomeCtrl.resolve = {
  fbFriends: _getFbFriends
};

function MemoCtrl($scope, $rootScope, $routeParams, fbFriends, memo, $location) {
  if (!Parse.User.current()) {
    return $location.path("/login");
  }
  
  $scope.saveButtonDisabled = true;

  var friend = _.find(fbFriends, function (friend) {
    if (friend.uid == $routeParams.uid) {
      return friend;
    }
  });

  $scope.pageName = 'Memo for ' + _constructDisplayName(friend.first_name, friend.middle_name, friend.last_name);

  if (!memo) {
    $scope.memoObject = new FbMemo({
      text: '',
      uid: $routeParams.uid,
      appUserId: Parse.User.current().id
    });
  } else {
    $scope.memoObject = memo;
  }
  $scope.memo = $scope.memoObject.toJSON();

  $scope.$watch('memo.text', function(newValue, oldValue){
    if (newValue != oldValue){ //enable save button if value changed
      $scope.saveButtonDisabled = false;
    }
  });
  
  //save memo function
  $scope.saveMemo = function() {

    //dont save blank memo if it is new
    if ($scope.memoObject.isNew() && $scope.memo.text == '') {
      return;
    }

    $scope.memoObject.save({
      text: $scope.memo.text,
      uid: friend.uid,
      appUserId: Parse.User.current().id
    },
    {
      success: function(result){
        $scope.memoObject = result;
        $scope.saveButtonDisabled = true;
        $scope.$apply();
      },
      error: function(error){
        alert('failed to save memo');
      }
    });
  };
};
MemoCtrl.resolve = {
  fbFriends: _getFbFriends,
  memo: function($q, $route, $rootScope) {
    
    if (!Parse.User.current()) {
      //no logged in user
      return;
    }

    var deferred = $q.defer();

    var friendUid = parseInt($route.current.params.uid,10);

    var query = new Parse.Query(FbMemo);
    query
    .equalTo('appUserId', Parse.User.current().id)
    .equalTo('uid', friendUid);
    
    query.first({
      success:  function(memo){
        deferred.resolve(memo);
        $rootScope.$apply();
      },
      error: function(error){
        alert.log('error retrieving note');
        deferred.reject(error);
      }
    });
    return deferred.promise;
  }
};

function LoginCtrl($scope, $rootScope, $routeParams, $location) {
  $scope.display = false;
  if (Parse.User.current()) {
    return $location.path("/home");
  }
  $scope.display = true;
  $scope.pageTitle = 'Friend Memos';
  $scope.loginButtonText = 'Login with Facebook'
  $scope.login = function () {
    Parse.FacebookUtils.logIn(null, {
      success: function(user){
        if (!user.existed()) {
          user.save(null, {
            success: function(user) {
              $location.path("/home");
              $scope.$apply();
            },
            error: function(user, error) {
              alert("Oops, something went wrong saving the user to parse.");
            }
          });
        } else {
          $location.path("/home");
          $scope.$apply();
        }
      },
      error: function(error){
        console.log("Oops, something went with logging in to Facebook.");
        $location.path("/login");
        $scope.$apply();
      }
    });
  };
}

function LogoutCtrl($scope, $routeParams, $location) {
  if (Parse.User.current() && Parse.User.current().authenticated()) {
    Parse.User.logOut();
    return $location.path("/login");
  }
  $location.path('/home');
}

function _getFbFriends($rootScope, $q, $location){
  if ($rootScope.fbFriends) {
    return $rootScope.fbFriends;
  }
  var deferred = $q.defer();
  
  if (!Parse.User.current()) {
    return undefined;
  }

  var facebookData = Parse.User.current().attributes.authData.facebook;

  if (!facebookData) {
    return undefined;
  }

  var fbAccessToken = facebookData.access_token;
  var fbUserId = facebookData.id;
  var fqlQuery = "SELECT first_name, middle_name, last_name, uid FROM user WHERE uid IN (SELECT uid2 FROM friend WHERE uid1="+fbUserId+") ORDER BY first_name";
  
  FB.api(
    '/fql', 
    {
      access_token: fbAccessToken,
      q: fqlQuery
    },
    function(response){
      if (!response || response.error) {
        if (response && response.error.type=='OAuthException') {
          Parse.User.logOut();
          $location.path('/login');
        } else {
          alert('could not retrieve fb friends, try reloading');
          deferred.reject(response);
        }
      } else {
        $rootScope.fbFriends = response.data;
        deferred.resolve(response.data);
      }
      $rootScope.$apply();
    }
  );

  return deferred.promise;
}

function _searchForFriends(queryString, friends) {
  var searchListIndex = 0;
  var firstNameStringMatches = [];
  var middleNameStringMatches = [];
  var lastNameStringMatches = [];
  var containStringMatches = [];
  while (searchListIndex < friends.length - 1) {
    var friend = friends[searchListIndex];
    var firstNameIndex = -1;
    var middleNameIndex = -1;
    var lastNameIndex = -1;
    var matched = false;
    if (friend.first_name) {
      firstNameIndex = friend.first_name.toLowerCase().indexOf(queryString);
      if (firstNameIndex == 0) {
        firstNameStringMatches.push(friend);
        matched = true;
      }
    }
    if (!matched && friend.middle_name) {
      middleNameIndex = friend.middle_name.toLowerCase().indexOf(queryString);
      if (middleNameIndex == 0) {
        middleNameStringMatches.push(friend);
        matched = true;
      }
    }
    if (!matched && friend.last_name) {
      lastNameIndex = friend.last_name.indexOf(queryString);
      if (lastNameIndex == 0) {
        lastNameStringMatches.push(friend);
        matched = true;
      }
    }
    if (!matched) {
      var fullName = _constructDisplayName(friend.first_name, friend.middle_name, friend.last_name);
      if (fullName.toLowerCase().indexOf(queryString) != -1) {
        containStringMatches.push(friend);
      }
    }
    searchListIndex++;
  }
  return _.union(firstNameStringMatches, middleNameStringMatches, lastNameStringMatches, containStringMatches);
}
function _constructDisplayName(firstName, middleName, lastName) {
  var displayName = firstName;
  if (middleName) {
    displayName = displayName + ' ' + middleName;
  }
  if (lastName) {
    displayName = displayName + ' ' + lastName;
  }
  return displayName;
}