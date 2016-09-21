'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('txStatus', function($delegate) {
    var defaultTemplateUrl = $delegate._templateUrl;
    $delegate._templateUrl = function(type, txp) {
      if (txp.customData && txp.customData.asset) {
        return txp.customData.asset.action == 'transfer'
            ? 'views/coloredcoins/modals/transfer-status.html'
            : 'views/coloredcoins/modals/issue-status.html';
      }
      return defaultTemplateUrl(type, txp);
    };
    return $delegate;
  });
});
