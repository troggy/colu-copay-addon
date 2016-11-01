'use strict';

angular.module('copayAddon.colu')
  .provider('coluConfig', function () {

  var that = this;

  this.config = {
    apiKey: '',
    mode: 'sdk',
    rpcConfig: {
      livenet: {
        rpcHost: '',      // Colu JSON RPC host
        rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth
        rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth
      },
      testnet: {
        rpcHost: '',      // Colu JSON RPC host
        rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth
        rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth
      }
    }
  };

  var assign = function(target) {
    // We must check against these specific cases.
    if (target === undefined || target === null) {
      throw new TypeError('Cannot convert undefined or null to object');
    }

    var output = Object(target);
    for (var index = 1; index < arguments.length; index++) {
      var source = arguments[index];
      if (source !== undefined && source !== null) {
        for (var nextKey in source) {
          if (source.hasOwnProperty(nextKey)) {
            output[nextKey] = source[nextKey];
          }
        }
      }
    }
    return output;
  };

  this.config = function(config) {
    this.config = assign({}, this.config, config);
  };

  this.$get = function() {
    return that.config;
  };
});
