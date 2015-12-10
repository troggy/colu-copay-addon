'use strict';

angular.module('copayAddon.coloredCoins').config(function ($provide) {
  $provide.decorator('availableBalanceDirective', function($delegate) {
    var directive = $delegate[0];
    directive.controller = function($rootScope, $scope, profileService, configService, coloredCoins, lodash) {
      var config = configService.getSync().wallet.settings;

      function setData(assets) {
        $scope.isAssetWallet = $scope.index.isAssetWallet;
        if ($scope.isAssetWallet) {
          $scope.availableBalanceStr = $scope.index.totalAssetBalanceStr;
        } else {
          var coloredBalanceSat = lodash.reduce(assets, function(total, asset) {
            total += asset.utxo.value;
            return total;
          }, 0);

          var availableBalanceSat = $scope.index.availableBalanceSat - coloredBalanceSat;
          $scope.availableBalanceStr = profileService.formatAmount(availableBalanceSat) + ' ' + config.unitName;
          $scope.coloredBalanceStr = profileService.formatAmount(coloredBalanceSat) + ' ' + config.unitName;
        }
      }

      setData(coloredCoins.assets);

      $rootScope.$on('ColoredCoins/AssetsUpdated', function(event, assets) {
        setData(assets);
      });
    };
    directive.templateUrl = 'colored-coins/views/includes/available-balance.html';
    return $delegate;
  });

});