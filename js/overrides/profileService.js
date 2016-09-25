'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('profileService', function ($delegate, $rootScope) {
    var defaultSetWalletClient = $delegate.setWalletClient;

    // do not enforce backups
    $delegate.needsBackup = function(client, cb) {
      return cb(false);
    };

    return $delegate;
  });
});
