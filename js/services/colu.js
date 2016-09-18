'use strict';

angular.module('copayAddon.colu')
  .provider('colu', function () {
  this.$get = function(coluConfig, coluRpc, coluSdk) {
    return coluConfig.mode === 'rpc' ? coluRpc : coluSdk;
  };
});
