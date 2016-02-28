var coluCopayModule = angular.module('copayAddon.colu', []);


angular.module('copayAddon.colu')
    .config(function ($stateProvider) {
      $stateProvider
          .state('assets', {
            url: '/assets',
            walletShouldBeComplete: true,
            needProfile: true,
            views: {
              'main': {
                templateUrl: 'colu-copay-addon/views/assets.html'
              }
            },
            onEnter: function($rootScope){
              $rootScope.$emit('Local/SetTab', 'assets', false);
            }
          });
    })
    .run(function (addonManager, coloredCoins, $state) {
      addonManager.registerAddon({
        formatPendingTxp: function(txp) {
          if (txp.customData && txp.customData.asset) {
            txp.amountStr = txp.customData.asset.balanceStr || txp.amountStr + '(colored)';
            txp.isColored = true;
            txp.toAddress = txp.outputs[0].toAddress; // txproposal
            txp.address = txp.outputs[0].address;     // txhistory
          }
        },
        processCreateTxOpts: function(txOpts) {
          txOpts.utxosToExclude = (txOpts.utxosToExclude || []).concat(coloredCoins.getColoredUtxos());
        }
      });
    });
'use strict';

angular.module('copayAddon.colu').config(function ($provide) {
  $provide.decorator('availableBalanceDirective', function($delegate) {
    var directive = $delegate[0];
    directive.controller = function($rootScope, $scope, profileService, configService, coloredCoins, lodash) {
      var config = configService.getSync().wallet.settings;

      function setData(assets, walletAsset) {
        $scope.isAssetWallet = walletAsset.isAsset;
        if ($scope.isAssetWallet) {
          $scope.availableBalanceStr = walletAsset.availableBalanceStr;
          $scope.showLockedBalance = !!walletAsset.lockedAmount;
          $scope.lockedBalanceStr = walletAsset.lockedBalanceStr;
          $scope.coloredBalanceStr = null;
        } else {
          var coloredBalanceSat = lodash.reduce(assets, function(total, asset) {
            total += lodash.sum(lodash.pluck(asset.utxos, 'value'));
            return total;
          }, 0);

          $scope.showLockedBalance = !!$scope.index.lockedBalanceSat;
          $scope.lockedBalanceStr = $scope.index.lockedBalanceSat;
          var availableBalanceSat = $scope.index.availableBalanceSat - coloredBalanceSat;
          $scope.availableBalanceStr = profileService.formatAmount(availableBalanceSat) + ' ' + config.unitName;
          $scope.coloredBalanceStr = profileService.formatAmount(coloredBalanceSat) + ' ' + config.unitName;
        }
      }

      coloredCoins.getAssets().then(function(assets) { 
        setData(assets, $scope.index.asset);
      });

      $rootScope.$on('Local/WalletAssetUpdated', function(event, walletAsset) {
        setData(coloredCoins.assets, walletAsset);
      });
    };
    directive.templateUrl = 'colu-copay-addon/views/includes/available-balance.html';
    return $delegate;
  });

});
'use strict';

/*
  Replace Copay's splash and disclaimer screens with single landing page
 */

angular.module('copayAddon.colu').config(function ($stateProvider) {

  $stateProvider.decorator('views', function (state, parent) {
    var views = parent(state);
    return views;
    // replace both default 'splash' and 'disclaimer' states with a single one
    if (state.name == 'splash' || state.name == 'disclaimer') {
      views['main@'].templateUrl = 'colu-copay-addon/views/landing.html';
      views['main@'].controller = function($scope, $timeout, $log, profileService, applicationService) {
        profileService.isDisclaimerAccepted(function(val) {
          $scope.agreed = val;
          $timeout(function() {
            $scope.$digest();
          }, 1);
        });

        $scope.goHome = function() {
          applicationService.restart();
        };

        $scope.agreeAndCreate = function(noWallet) {
          profileService.setDisclaimerAccepted(function(err) {

            if (profileService.profile) {
              $timeout(function() {
                applicationService.restart();
              }, 1000);
              return;
            }

            $scope.creatingProfile = true;

            profileService.create({
              noWallet: noWallet
            }, function(err) {
              if (err) {
                $scope.creatingProfile = false;
                $log.warn(err);
                $scope.error = err;
                $scope.$apply();
                $timeout(function() {
                  $scope.create(noWallet);
                }, 3000);
              }
            });
          });

        };
      }

    }

    return views;
  });

});
'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('profileService', function ($delegate, $rootScope) {
    var defaultSetWalletClient = $delegate.setWalletClient;

    $delegate.setWalletClient = function (credentials) {
      defaultSetWalletClient(credentials);
      var client = $delegate.walletClients[credentials.walletId];

      if (!client) return;

      var defaultBroadcastTxProposal = client.broadcastTxProposal.bind(client);

      client.broadcastTxProposal = function (txp, opts, cb) {
        if (txp.customData && txp.customData.financeTxId) {
          var disableSuccessListener, disableErrorListener;
          disableSuccessListener = $rootScope.$on('ColoredCoins/Broadcast:success', function() {
            disableSuccessListener();
            disableErrorListener();
            defaultBroadcastTxProposal(txp, opts, cb);
          });
          disableErrorListener = $rootScope.$on('ColoredCoins/Broadcast:error', function(e, err) {
            disableSuccessListener();
            disableErrorListener();
            cb(err);
          });

          $rootScope.$emit('ColoredCoins/BroadcastTxp', txp);
        } else {
          defaultBroadcastTxProposal(txp, opts, cb);
        }
      };

      return client;
    };
    return $delegate;
  });
});
'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('txStatus', function($delegate) {
    var defaultTemplateUrl = $delegate._templateUrl;
    $delegate._templateUrl = function(type, txp) {
      if (txp.customData && txp.customData.asset) {
        return txp.customData.asset.action == 'transfer'
            ? 'colu-copay-addon/views/modals/transfer-status.html'
            : 'colu-copay-addon/views/modals/issue-status.html';
      }
      return defaultTemplateUrl(type, txp);
    };
    return $delegate;
  });
});
'use strict';

angular.module('copayAddon.colu')
    .controller('assetsController', function ($rootScope, $scope, $timeout, $modal, isCordova, coloredCoins) {
      var self = this;

      coloredCoins.getAssets().then(function(assets) {
          self.assets = assets;
      });
      this.error = coloredCoins.error;

      var disableAssetListener = $rootScope.$on('ColoredCoins/AssetsUpdated', function (event, assets) {
        self.assets = assets;
      });

      var disableErrorListener = $rootScope.$on('ColoredCoins/Error', function (event, errorMsg) {
        self.error = errorMsg;
      });

      var disableOngoingProcessListener = $rootScope.$on('Addon/OngoingProcess', function(e, name) {
        self.setOngoingProcess(name);
      });

      $scope.$on('$destroy', function () {
        disableAssetListener();
        disableOngoingProcessListener();
        disableErrorListener();
      });

      this.setOngoingProcess = function(name) {
        var self = this;
        self.blockUx = !!name;

        if (isCordova) {
          if (name) {
            window.plugins.spinnerDialog.hide();
            window.plugins.spinnerDialog.show(null, name + '...', true);
          } else {
            window.plugins.spinnerDialog.hide();
          }
        } else {
          self.onGoingProcess = name;
          $timeout(function() {
            $rootScope.$apply();
          });
        }
      };

      // show ongoing process if any
      this.setOngoingProcess(coloredCoins.onGoingProcess);

      var hideModal = function () {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass('slideOutDown');
      };

      this.openTransferModal = function (asset) {
        $scope.asset = asset;

        var modalInstance = $modal.open({
          templateUrl: 'colu-copay-addon/views/modals/send.html',
          scope: $scope,
          windowClass: 'full animated slideInUp',
          controller: AssetTransferController
        });

        modalInstance.result.finally(hideModal);
      };

      this.openAssetModal = function (asset) {
        var ModalInstanceCtrl = function ($rootScope, $scope, $modalInstance, insight, profileService) {
          $scope.asset = asset;
          insight = insight.get();
          insight.getTransaction(asset.issuanceTxid, function (err, tx) {
            if (!err) {
              $scope.issuanceTx = tx;
            }
          });
          $scope.openTransferModal = self.openTransferModal;

          $scope.openBlockExplorer = function (asset) {
            var url = 'http://coloredcoins.org/explorer/';
            var networkSuffix = profileService.focusedClient.credentials.network == 'testnet' ? 'testnet/' : '';
            $rootScope.openExternalLink(url + networkSuffix + 'tx/' + asset.issuanceTxid);
          };

          $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
          };
        };
        var modalInstance = $modal.open({
          templateUrl: 'colu-copay-addon/views/modals/asset-details.html',
          windowClass: 'full animated slideInUp',
          controller: ModalInstanceCtrl
        });

        modalInstance.result.finally(hideModal);
      };

      this.openIssueModal = function () {

        var modalInstance = $modal.open({
          templateUrl: 'colu-copay-addon/views/modals/issue.html',
          windowClass: 'full animated slideInUp',
          controller: AssetIssueController
        });

        modalInstance.result.finally(hideModal);
      };
    });
'use strict';

function ProcessingTxController($rootScope, $scope, $timeout, $log, coloredCoins, gettext, profileService, feeService,
                                lodash, bitcore, txStatus, $modalInstance) {
  this.$rootScope = $rootScope;
  this.profileService = profileService;
  this.$log = $log;
  this.gettext = gettext;
  this.bitcore = bitcore;
  this.coloredCoins = coloredCoins;
  this.feeService = feeService;
  this._ = lodash;
  this.$scope = $scope;
  this.$timeout = $timeout;
  this.txStatus = txStatus;
  this.$modalInstance = $modalInstance;

  var self = this;

  $scope.error = '';

  $scope.resetError = function () {
    self.error = self.success = null;
  };

  $scope.cancel = function () {
    self.$modalInstance.dismiss('cancel');
  };
}

ProcessingTxController.prototype.setOngoingProcess = function (name) {
  this.$rootScope.$emit('Addon/OngoingProcess', name);
};

ProcessingTxController.prototype._setError = function (err) {
  var fc = this.profileService.focusedClient;
  this.$log.error(err);
  var errMessage = fc.credentials.m > 1
      ? this.gettext('Could not create transaction proposal')
      : this.gettext('Could not perform transaction');

  //This are abnormal situations, but still err message will not be translated
  //(the should) we should switch using err.code and use proper gettext messages
  err.message = err.error ? err.error : err.message;
  errMessage = errMessage + '. ' + (err.message ? err.message : this.gettext('Check you connection and try again'));

  this.$scope.error = errMessage;

};

ProcessingTxController.prototype._handleError = function(err) {
  this.setOngoingProcess();
  this.profileService.lockFC();
  return this._setError(err);
};

ProcessingTxController.prototype._signAndBroadcast = function (txp, cb) {
  var self = this,
  		fc = self.profileService.focusedClient;
  self.setOngoingProcess(self.gettext('Signing transaction'));
  fc.signTxProposal(txp, function (err, signedTxp) {
    self.profileService.lockFC();
    self.setOngoingProcess();
    if (err) {
      err.message = self.gettext('Transaction was created but could not be signed. Please try again from home screen.') + (err.message ? ' ' + err.message : '');
      return cb(err);
    }

    if (signedTxp.status == 'accepted') {
      self.setOngoingProcess(self.gettext('Broadcasting transaction'));
      fc.broadcastTxProposal(signedTxp, function (err, btx, memo) {
        self.setOngoingProcess();
        if (err) {
          err.message = self.gettext('Transaction was signed but could not be broadcasted. Please try again from home screen.') + (err.message ? ' ' + err.message : '');
          return cb(err);
        }

        return cb(null, btx);
      });
    } else {
      self.setOngoingProcess();
      return cb(null, signedTxp);
    }
  });
};

ProcessingTxController.prototype._createAndExecuteProposal = function (txHex, toAddress, customData) {
  var self = this;
  var fc = self.profileService.focusedClient;
  var tx = new self.bitcore.Transaction(txHex);
  self.$log.debug(JSON.stringify(tx.toObject(), null, 2));

  var inputs = self._.map(tx.inputs, function (input) {
    input = input.toObject();
    var storedInput = self.coloredCoins.txidToUTXO[input.prevTxId + ":" + input.outputIndex]
        || self.coloredCoins.scriptToUTXO[input.script || input.scriptPubKey];
    input.publicKeys = storedInput.publicKeys;
    input.path = storedInput.path;

    if (!input.txid) {
      input.txid = input.prevTxId;
    }
    if (!input.satoshis) {
      input.satoshis = 0;
    }
    return input;
  });

  var outputs = self._.chain(tx.outputs)
      .map(function (o) {
        return { script: o.script.toString(), amount: o.satoshis };
      })
      .value();

  // for Copay to show recipient properly
  outputs[0].toAddress = toAddress;

  self.setOngoingProcess(self.gettext('Creating tx proposal'));
  self.feeService.getCurrentFeeValue(null, function (err, feePerKb) {
    if (err) self.$log.debug(err);
    fc.sendTxProposal({
      type: 'external',
      inputs: inputs,
      outputs: outputs,
      noOutputsShuffle: true,
      message: '',
      payProUrl: null,
      feePerKb: feePerKb,
      fee: 1000,
      customData: customData
    }, function (err, txp) {
      if (err) {
        return self._handleError(err);
      }

      self._signAndBroadcast(txp, function (err, tx) {
        self.setOngoingProcess();
        self.profileService.lockFC();
        if (err) {
          self.error = err.message ? err.message : self.gettext('Transaction proposal was created but could not be completed. Please try again from home screen');
          self.$scope.$emit('Local/TxProposalAction');
          self.$timeout(function() {
            self.$scope.$digest();
          }, 1);
        } else {
          self.txStatus.notify(tx, function () {
            self.$scope.$emit('Local/TxProposalAction');
          });
        }
        self.$scope.cancel();
      });
    });
  });
};

'use strict';

var AssetIssueController = function ($rootScope, $scope, $modalInstance, $timeout, $log, coloredCoins, gettext,
                                     profileService, feeService, lodash, bitcore, txStatus, ccConfig, Upload,
                                     ccFeeService, configService, insight) {

  ProcessingTxController.call(this, $rootScope, $scope, $timeout, $log, coloredCoins, gettext, profileService, feeService,
      lodash, bitcore, txStatus, $modalInstance, insight);

  var self = this;

  $scope.issuance = {
    userData: []
  };

  $scope.estimatedCost = '...';

  ccFeeService.estimateCostOfIssuance(function(err, fee, totalCost) {
    if (err) {
      return self._handleError(err);
    }
    var config = configService.getSync().wallet.settings;
    $scope.estimatedCost = profileService.formatAmount(totalCost) + ' ' + config.unitName;
    $scope.$digest();
  });

  $scope.addField = function() {
    $scope.issuance.userData.push({ name: '', value: ''});
  };

  $scope.removeField = function(field) {
    lodash.pull($scope.issuance.userData, field);
  };

  var createAsset = function(issuance, iconData) {
    self.setOngoingProcess(gettext('Creating issuance transaction'));
    coloredCoins.createIssueTx(issuance, function (err, result) {
      if (err) {
        self._handleError(err);
      }

      var tx = {
        status: 'broadcasted',
        customData: {
          asset: {}
        }
      };

      txStatus.notify(tx, function () {
        self.$scope.$emit('Local/TxProposalAction');
      });
    });
  };

  var createAssetWithIcon = function(issuance, icon) {
    Upload.upload({
      url: ccConfig.uploadHost + '/upload',
      file: icon
    }).success(function (iconData, status, headers, config) {
      if (!iconData.url || iconData.url.indexOf('https://s3') != 0) {
        console.log('Error uploading: ' + status + ' ' + iconData);
        return self._handleError({ error: 'Failed to upload icon'});
      }
      console.log('Icon uploaded. URL: ' + iconData);
      issuance.urls = [
        {
          name: "icon",
          url: iconData.url,
          mimeType: iconData.mimeType
        }];
      createAsset(issuance, iconData);
    }).error(function (data, status, headers, config) {
      console.log('error uploading icon: ' + status + " " + data);
      self._handleError({ error: "Failed to upload icon" });
    })
  };

  $scope.issueAsset = function (form) {
    if (form.$invalid) {
      this.error = gettext('Unable to send transaction proposal');
      return;
    }

    var fc = profileService.focusedClient;
    if (fc.isPrivKeyEncrypted()) {
      profileService.unlockFC(function (err) {
        if (err) return self._setError(err);
        return $scope.issueAsset(form);
      });
      return;
    }

    if (this.file) {
      createAssetWithIcon(this.issuance, this.file);
    } else {
      createAsset(this.issuance);
    }
  };
};

AssetIssueController.prototype = Object.create(ProcessingTxController.prototype);

'use strict';

var AssetTransferController = function ($rootScope, $scope, $modalInstance, $timeout, $log, coloredCoins, gettext,
                                        profileService, feeService, lodash, bitcore, txStatus) {

  ProcessingTxController.call(this, $rootScope, $scope, $timeout, $log, coloredCoins, gettext, profileService, feeService,
      lodash, bitcore, txStatus, $modalInstance);

  var self = this;

  $scope.onQrCodeScanned = function (data) {
    this.error = '';
    var form = this.assetTransferForm;
    if (data) {
      form.address.$setViewValue(new bitcore.URI(data).address.toString());
      form.address.$isValid = true;
      form.address.$render();
      $scope.lockAddress = true;
    }

    if (form.address.$invalid) {
      $scope.resetError();
      $scope.lockAddress = false;
      $scope._address = null;
      this.error = gettext('Could not recognize a valid Bitcoin QR Code');
    }
  };

  $scope.transferAsset = function (transfer, form) {
    if ($scope.asset.locked) {
      self._setError({ message: "Cannot transfer locked asset" });
      return;
    }

    if (form.$invalid) {
      this.error = gettext('Unable to send transaction proposal');
      return;
    }

    coloredCoins.sendTransferTxProposal(transfer._amount, transfer._address, transfer._comment, $scope.asset, function(err, txp) {
      if (err) {
        self.setOngoingProcess();
        profileService.lockFC();
        return self._handleError(err);
      }
      
      if (!fc.canSign() && !fc.isPrivKeyExternal()) {
        $log.info('No signing proposal: No private key')
        self.setOngoingProcess();
        self.resetForm();
        txStatus.notify(txp, function() {
          return $scope.$emit('Local/TxProposalAction');
        });
        return;
      }

      self.signAndBroadcast(txp, function(err) {
        self.setOngoingProcess();
        self.resetForm();
        if (err) {
          self.error = err.message ? err.message : gettext('The payment was created but could not be completed. Please try again from home screen');
          $scope.$emit('Local/TxProposalAction');
          $timeout(function() {
            $scope.$digest();
          }, 1);
        } else {
          self.$scope.cancel();
        }
      });
    });
  };
};

AssetTransferController.prototype = Object.create(ProcessingTxController.prototype);

'use strict';


angular.module('copayAddon.colu')
    .service('ccFeeService', function (profileService, feeService, $log) {
      var SATOSHIS_FOR_ISSUANCE_COLORING = 1300,
          SATOSHIS_FOR_TRANSFER_COLORING = 600,
          root = {};

      // from BWS TxProposal.prototype.getEstimatedSize
      var _getEstimatedSize = function(nbInputs, nbOutputs) {
        var credentials = profileService.focusedClient.credentials;
        // Note: found empirically based on all multisig P2SH inputs and within m & n allowed limits.
        var safetyMargin = 0.05;
        var walletM = credentials.m;

        var overhead = 4 + 4 + 9 + 9;
        var inputSize = walletM * 72 + credentials.n * 36 + 44;
        var outputSize = 34;
        nbOutputs = nbOutputs + 1;

        var size = overhead + inputSize * nbInputs + outputSize * nbOutputs;

        return parseInt((size * (1 + safetyMargin)).toFixed(0));
      };

      root.estimateFee = function(nbInputs, nbOutputs, cb) {
        feeService.getCurrentFeeValue(null, function(err, feePerKb) {
          if (err) $log.debug(err);

          var size = _getEstimatedSize(nbInputs, nbOutputs);
          $log.debug("Estimated size: " + size);
          var fee = feePerKb * size / 1000;
          fee = parseInt(fee.toFixed(0));
          $log.debug("Estimated fee: " + fee);
          return cb(null, fee);
        });
      };

      root.estimateCostOfIssuance = function(cb) {
        var nInputs = 1; // issuing address
        var nOutputs = 3; // outputs for issuance coloring scheme

        root.estimateFee(nInputs, nOutputs, function(err, fee) {
          var amount = fee + SATOSHIS_FOR_ISSUANCE_COLORING;
          $log.debug("Estimated cost of issuance: " + amount);
          return cb(err, fee, amount);
        });
      };

      root.estimateCostOfTransfer = function(transferUnits, totalUnits, cb) {
        var hasChange = transferUnits < totalUnits;

        var nInputs = 2; // asset address + finance utxo
        // 2 outputs if spending without change: colored UTXO + OP_RETURN
        // 3 outputs if spending with change: colored UTXO + OP_RETURN + colored UTXO with change
        var nOutputs = hasChange ? 3 : 2;

        root.estimateFee(nInputs, nOutputs, function(err, fee) {
          // We need extra satoshis if we have change transfer, these will go to change UTXO
          var amount = hasChange ? fee + SATOSHIS_FOR_TRANSFER_COLORING : fee;
          $log.debug("Estimated cost of transfer: " + amount);
          return cb(err, fee, amount);
        });
      };

      return root;
    });

'use strict';

function ColoredCoins($rootScope, profileService, addressService, coluRpc, $log,
                      $q, $timeout, lodash, configService, bitcore, supportedAssets) {
  var root = {},
      lockedUtxos = [],
      self = this;
      
      
  self.txs = $q.defer(),
  self.assets = $q.defer();
  self._queued = {};
  self.isAvailable = false;
  self.supportedAssets = supportedAssets;

  // UTXOs "cache"
  root.txidToUTXO = {};
  root.assets = null;
  root.txs = null;
  root.assetsMap = {};
  root.error = null;

  var disableFocusListener = $rootScope.$on('Local/NewFocusedWallet', function() {
    root.assets = null;
    root.assetsMap = {};
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    self.isAvailable = false;
  });
  
  var _setOngoingProcess = function(name) {
    $rootScope.$emit('Addon/OngoingProcess', name);
    root.onGoingProcess = name;
  };
  
  var disableBalanceListener = $rootScope.$on('Local/BalanceUpdated', function (event, balance) {
    root.assets = null;
    root.assetsMap = null;
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    self.isAvailable = false;
    $rootScope.$emit('ColoredCoins/Error', null);
    var addresses = lodash.pluck(balance.byAddress, 'address');
    
    $q.all([root.getAssets(), root.getColorTransactions()]).then(function(result) {
      self.isAvailable = true;
      lodash.values(self._queued).forEach(function(callback) {
        $timeout(function() {
          callback(result[0], result[1]);
        }, 1);
      });
      self._queued = {};
    });

    if (addresses.length) {
      coluRpc.getTransactions(addresses, function(err, body) {
        if (err) {
          self.txs.reject(err);
        } else {
          var txMap = lodash.reduce(body, function(map, tx) {
            map[tx.txid] = tx;
            return map;
          }, {});
          root.txs = txMap;
          self.txs.resolve(txMap);
        }
      });
    }

    _setOngoingProcess('Getting assets');
    _fetchAssets(addresses, function (err, assetsMap) {
      if (err) {
        var msg = err.error || err.message || err.code;
        root.error = msg;
        self.assets.reject(msg);
        $rootScope.$emit('ColoredCoins/Error', msg);
        $log.error(msg);
      } else {
        root.assets = lodash.values(assetsMap);
        self.assets.resolve(root.assets);
        root.assetsMap = assetsMap;
        $rootScope.$emit('ColoredCoins/AssetsUpdated', root.assets);
      }
      _setOngoingProcess();
    });
  });
  
  root.whenAvailable = function(cb) {
    if (self.isAvailable) {
      $timeout(function() {
        cb(root.assets, root.txs);
      }, 1);
    } else {
      self._queued[cb] = cb;
    }
  };

  $rootScope.$on('$destroy', function() {
    disableBalanceListener();
    disableFocusListener();
  });

  var extractAssets = function(addressInfo) {
    var assets = [];
    if (!addressInfo.utxos || addressInfo.utxos.length == 0) return assets;

    addressInfo.utxos.forEach(function(utxo) {
      if (utxo.assets && utxo.assets.length > 0) {
        var utxoToKeep = lodash.pick(utxo, [ 'txid', 'index', 'value', 'scriptPubKey'])
        var utxoAssets = lodash
          .chain(utxo.assets)
          .reduce( function(map, asset) {
            var assetSummary = map[asset.assetId];
            if (!assetSummary) {
              map[asset.assetId] = assetSummary = { 
                amount: 0, 
                assetId: asset.assetId,
                utxo: utxoToKeep
              };
            }
            assetSummary.amount += asset.amount;
            return map;
          }, {})
          .values()
          .value();
        assets = assets.concat(utxoAssets);
      }
    });

    return assets;
  };

  var _updateLockedUtxos = function(cb) {
    var fc = profileService.focusedClient;
    fc.getUtxos({}, function(err, utxos) {
      if (err) { return cb(err); }
      _setLockedUtxos(utxos);

      root.txidToUTXO = {};
      root.scriptToUTXO = {};
      lodash.each(utxos, function(utxo) {
        root.txidToUTXO[utxo.txid + ":" + utxo.vout] = utxo;
        root.scriptToUTXO[utxo.scriptPubKey] = utxo;
      });
      cb();
    });
  };

  var _setLockedUtxos = function(utxos) {
    self.lockedUtxos = lodash.chain(utxos)
        .filter('locked')
        .map(function(utxo) { return utxo.txid + ":" + utxo.vout; })
        .value();
  };

  var _extractAssetIcon = function(metadata) {
    var icon = lodash.find(lodash.property('metadataOfIssuence.data.urls')(metadata) || [], function(url) { return url.name == 'icon'; });
    return icon ? icon.url : null;
  };

  root.getColorTransactions = function() {
    return self.txs.promise;
  };
  
  root.getAssets = function() {
    return self.assets.promise;
  };

  root.getColoredUtxos = function() {
    return lodash.map(lodash.flatten(lodash.pluck(root.assets, 'utxos')), function(utxo) { return utxo.txid + ":" + utxo.index; });
  };

  var _fetchAssets = function(addresses, cb) {
    if (addresses.length == 0) {
      return cb(null, {});
    }
    _updateLockedUtxos(function(err) {
      if (err) { return cb(err); }

      var assetsMap = {},
          assetPromises = lodash.map(addresses, function (address) {
            return _getAssetsForAddress(address, assetsMap);
          });
      
      $q.all(assetPromises).then(function() {
        lodash.each(lodash.values(assetsMap), function(asset) {
            asset.unitSymbol = root.getAssetSymbol(asset.assetId, asset);
            asset.balanceStr = root.formatAssetAmount(asset.amount, asset);
            asset.lockedBalanceStr = root.formatAssetAmount(asset.lockedAmount, asset);
            asset.availableBalance = asset.amount - asset.lockedAmount;
            asset.availableBalanceStr = root.formatAssetAmount(asset.availableBalance, asset);
        });
        cb(null, assetsMap);
      }, function(err) {
        cb(err);
      });
    });
  };
  
  var _addColoredUtxoToMap = function(asset, metadata, address, network, assetsMap) {
    var groupedAsset = assetsMap[asset.assetId];
    if (!groupedAsset) {
      groupedAsset = { 
                      assetId: asset.assetId,
                      amount: 0,
                      network: network,
                      divisible: metadata.divisibility,
                      reissuable: metadata.lockStatus == false,
                      icon: _extractAssetIcon(metadata),
                      issuanceTxid: metadata.issuanceTxid,
                      metadata: metadata.metadataOfIssuence.data,
                      lockedAmount: 0,
                      utxos: []
                   };
      assetsMap[asset.assetId] = groupedAsset;
    }
    var isLocked = lodash.includes(self.lockedUtxos, asset.utxo.txid + ":" + asset.utxo.index);
    if (isLocked) {
      groupedAsset.lockedAmount += asset.amount;
    }
    lodash.assign(asset.utxo, { assetAmount: asset.amount, address: address, isLocked: isLocked })
    groupedAsset.utxos.push(asset.utxo);
    groupedAsset.amount += asset.amount;
  };
  
  var _filterSupportedAssets = function(assetsInfo) {
    var supportedAssets = lodash.pluck(self.supportedAssets, 'assetId');
    assetsInfo = lodash.reject(assetsInfo, function(i) {
      return supportedAssets.indexOf(i.assetId) == -1;
    });
    return assetsInfo;
  }

  var _getAssetsForAddress = function(address, assetsMap) {
    return $q(function(resolve, reject) {
      coluRpc.getAddressInfo(address, function(err, addressInfo) {
        if (err) { return reject(err); }

        var assetsInfo = extractAssets(addressInfo);
        $log.debug("Assets for " + address + ": " + JSON.stringify(assetsInfo));
        assetsInfo = _filterSupportedAssets(assetsInfo);
        
        var network = profileService.focusedClient.credentials.network;
        assetData = assetsInfo.map(function(asset, i) {
          return $q(function(resolve, reject) {
            coluRpc.getAssetMetadata(asset, function(err, metadata) {
              if (err) { return reject(err); }
              _addColoredUtxoToMap(asset, metadata, address, network, assetsMap);
              resolve();
            });
          });
        });

        $q.all(assetData).then(function() {
          resolve();
        }, function() {
          reject();
        });
      });
    });
  };
  
  var _selectUtxos = function(utxos, amount) {
      utxos = lodash.sortBy(utxos, 'assetAmount');
      
      // first, let's try to use single utxo with exact amount,
      // then try to use smaller utxos to collect required amount (to reduce fragmentation)
      var totalAmount = 0,
          firstUsedIndex = -1,
          changeAddress,
          selected = [];
      for (var i = utxos.length - 1; i >= 0; i--) {
        if (utxos[i].assetAmount > amount || utxos[i].isLocked) continue;
        if (firstUsedIndex < 0) { 
          firstUsedIndex = i;
        }
        totalAmount += utxos[i].assetAmount;
        selected.push(utxos[i].txid + ":" + utxos[i].index);
        if (!changeAddress) {
          changeAddress = utxos[i].address;
        }
        if (totalAmount >= amount) {
          return { utxos: selected, amount: totalAmount, changeAddress: changeAddress };
        }
      }

      // not enough smaller utxos, use the one bigger, if any
      if (firstUsedIndex < utxos.length - 1 && !utxos[firstUsedIndex + 1].isLocked) {
        return { 
          utxos: [utxos[firstUsedIndex + 1].txid + ":" + utxos[firstUsedIndex + 1].index], 
          amount: utxos[firstUsedIndex + 1].assetAmount,
          changeAddress: utxos[firstUsedIndex + 1].address
        };
      }
      
      return null;
  };

  var createTransferTx = function(asset, amount, toAddress, cb) {
    if (amount > asset.availableBalance) {
      return cb({ error: "Cannot transfer more assets then available" }, null);
    }

    var to = [{
      "address": toAddress,
      "amount": amount,
      "assetId": asset.assetId
    }];
    
    var selectedUtxos = _selectUtxos(asset.utxos, amount);
    if (!selectedUtxos) {
      return cb({ message: 'Not enough assets' });
    }

    // transfer the rest of asset back to our address
    if (amount < selectedUtxos.amount) {
      to.push({
        "address": selectedUtxos.changeAddress,
        "amount": selectedUtxos.amount - amount,
        "assetId": asset.assetId
      });
    }

    var transfer = {
      sendutxo: selectedUtxos.utxos,
      to: to,
      flags: {
        injectPreviousOutput: true
      }
    };

    coluRpc.createTx('send', transfer, cb);
  };

  root.createIssueTx = function(issuance, cb) {

    var fc = profileService.focusedClient;
    addressService.getAddress(fc.credentials.walletId, true, function(err, freshAddress) {
      if (err) { return cb(err); }

      var metadata = lodash.pick(issuance, ['assetName', 'description', 'issuer', 'urls', 'userData']);
      // convert { name: 'Color', value: 'Blue' } to { "Color" : "Blue" }
      metadata.userData = lodash.reduce(metadata.userData, function(result, field) {
        if (field.name !== '' && field.value !== '') {
          result[field.name] = field.value;
        }
        return result;
      }, {});

      var issuanceOpts = {
        divisibility: 0,
        amount: issuance.amount,
        reissueable: issuance.reissuable || false,
        transfer: [{
          'address': freshAddress,
          'amount': issuance.amount
        }],
        metadata: metadata
      };

      coluRpc.issueAsset(issuanceOpts, cb);
    });
  };
  
  var getSymbolFromConfig = function(assetId) {
    try {
      var asset = lodash.find(self.supportedAssets, function(a) {
        return a.assetId === assetId;
      });
      return { symbol: asset.symbol, pluralSymbol: asset.pluralSymbol };
    } catch (e) {
    }
    
    return null;
  };

  root.getAssetSymbol = function(assetId, asset) {
    var symbolData = getSymbolFromConfig(assetId);
    return UnitSymbol.create(symbolData) || UnitSymbol.DEFAULT;
  };

  root.formatAssetAmount = function(amount, asset, unitSymbol) {
    asset = asset || {};
    
    function formatAssetValue(value, decimalPlaces) {
      if (!value) {
        return '0';
      }
      value = (value / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
      var x = value.split('.');
      var x0 = x[0];
      var x1 = x[1];

      x0 = x0.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return decimalPlaces > 0 ? x0 + '.' + x1 : x0;
    }
    
    if (!asset.unitSymbol) {
      asset.unitSymbol = unitSymbol || root.getAssetSymbol(asset.assetId, asset);
    }

    return formatAssetValue(amount, asset ? asset.divisible: 0) + ' ' + asset.unitSymbol.forAmount(amount);
  };
  
  root.sendTransferTxProposal = function (amount, toAddress, comment, asset, cb) {
    $log.debug("Transfering " + amount + " units(s) of asset " + asset.assetId + " to " + toAddress);

    var fc = profileService.focusedClient;
    
    createTransferTx(asset, amount, toAddress, function (err, result) {
      if (err) { 
        return cb(err.error || err);
      }

      var customData = {
        asset: {
          action: 'transfer',
          assetId: asset.assetId,
          assetName: asset.metadata.assetName,
          icon: asset.icon,
          amount: amount,
          balanceStr: root.formatAssetAmount(amount, asset)
        },
        financeTxId: result.financeTxid
      };
      sendTxProposal(result.txHex, toAddress, comment, customData, cb);
    });
  };

  var sendTxProposal = function (txHex, toAddress, comment, customData, cb) {
    var fc = profileService.focusedClient;
    var tx = new bitcore.Transaction(txHex);
    $log.debug(JSON.stringify(tx.toObject(), null, 2));

    var inputs = lodash.map(tx.inputs, function (input) {
      input = input.toObject();
      var storedInput = root.txidToUTXO[input.prevTxId + ":" + input.outputIndex]
          || root.scriptToUTXO[input.script || input.scriptPubKey];
      input.publicKeys = storedInput.publicKeys;
      input.path = storedInput.path;
      input.vout = input.vout || input.outputIndex;

      if (!input.txid) {
        input.txid = input.prevTxId;
      }
      if (!input.satoshis) {
        input.satoshis = 0;
      }
      return input;
    });

    var outputs = lodash.chain(tx.outputs)
        .map(function (o) {
          return { script: o.script.toString(), amount: o.satoshis };
        })
        .value();

    // for Copay to show recipient properly
    outputs[0].toAddress = toAddress;

    fc.sendTxProposal({
      type: 'external',
      inputs: inputs,
      outputs: outputs,
      noOutputsShuffle: true,
      message: comment,
      payProUrl: null,
      feePerKb: 43978,
      fee: 5000,
      customData: customData,
      utxosToExclude: root.getColoredUtxos()
    }, function (err, txp) {
      if (err) {
        return cb(err);
      }
      txp.changeAddress = inputs[0].address;
      return cb(null, txp);
    });
  };

  return root;
}


angular.module('copayAddon.colu').provider('coloredCoins', function() {
  
  var supportedAssets;
  
  this.setSupportedAssets = function(supportedAssets) {
    this.supportedAssets = supportedAssets;
  };
  
  this.$get = function($rootScope, profileService, addressService, coluRpc, $log,
                        $q, $timeout, lodash, configService, bitcore) {
      return new ColoredCoins($rootScope, profileService, addressService, coluRpc, $log,
                            $q, $timeout, lodash, configService, bitcore, this.supportedAssets);
  };
});

'use strict';

angular.module('copayAddon.colu')
  .provider('coluRpc', function () {

  var that = this;

  this.rpcConfig = {
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
  };
    
  this.configure = function(config) {
    this.rpcConfig = config;
  }

  this.$get = function(profileService, $rootScope, $log, $http) {
    var root = {};
    
    that._handleDataResponse = function(response, cb) {
      var data = response.data;
      if (data.error) {
        cb(data.error);
      } else if (data.errorMessage) {
        cb(data.errorMessage);
      } else {
        cb(null, data.result);
      }
    };

    that._handleErrorResponse = function(response, cb) {
      $log.error(response.status + ': ' + JSON.stringify(response.data));
      cb(response.status == 500 ? 'Server error' : response.data);
    };

    var withLog = function(cb) {
      return function(err, body) {
        var errStr = err ? JSON.stringify(err) : err;
        var bodyStr = body ? JSON.stringify(body).substring(0, 3000) + ".." : body;
        $log.debug("Colu returned: [" + errStr + "] " + bodyStr);
        return cb(err, body);
      };
    };
    
    var _request = function(method, data, cb) {
      var network = profileService.focusedClient.credentials.network,
          rpcConfig = that.rpcConfig[network];
      

      if (rpcConfig.authName) {
        config.headers = {
          Authorization: 'Basic ' + $base64.encode(rpcConfig.authName + ':' + rpcConfig.authSecret)
        };
      }
      
      var request = {
        url: rpcConfig.baseUrl,
        method: 'POST',
        data: {
          method: method,
          jsonrpc: "2.0",
          id: "1",
          params: data
        }
      };
      $http(request).then(function successCallback(response) {
        that._handleDataResponse(response, withLog(cb));
      }, function errorCallback(response) {
        that._handleErrorResponse(response, withLog(cb));
      });
    };
    
    $rootScope.$on('ColoredCoins/BroadcastTxp', function(e, txp) {
      root.broadcastTx(txp.raw, txp.customData.financeTxId, function (err, body) {
        if (err) {
          return $rootScope.$emit('ColoredCoins/Broadcast:error', { name: 'ERROR', message: "Colu returns error" });
        }

        $rootScope.$emit('ColoredCoins/Broadcast:success');
      });
    });

    root.broadcastTx = function(signedTxHex, lastTxId, cb) {
      $log.debug('Broadcasting tx via Colu: ' + JSON.stringify({
        last_txid: lastTxId,
        tx_hex: signedTxHex
      }));
      var params = {
        signedTxHex: signedTxHex,
        lastTxid: lastTxId
      };  
            
      _request("transmit", params, cb);  
    };

    root.getAssetMetadata = function(asset, cb) {
      var params = {
        assetId: asset.assetId,
        utxo: asset.utxo.txid + ":" + asset.utxo.index
      };
            
      _request("getAssetMetadata", params, cb);  
    };

    root.getAddressInfo = function(address, cb) {
      _request("coloredCoins.getAddressInfo", { address: address }, cb);  
    };

    root.issueAsset = function(params, cb) {
      $log.debug("Issuing asset via Colu: " + JSON.stringify(params));
            
      _request("issueAsset", { params : params }, cb);  
    };

    root.createTx = function(type, args, cb) {
      $log.debug("Creating " + type + " asset tx via Colu: " + JSON.stringify(args));
      var params = {
        type: type,
        args: args
      };  
            
      _request("buildTransaction", params, cb);  
    };
    
    root.getTransactions = function(addresses, cb) {
      $log.debug("Getting transactions for addresses via Colu..");
      var params = {
        addresses: addresses
      };
            
      _request("getTransactions", params, cb);  
    };

    return root;
  }
  
});

'use strict';


angular.module('copayAddon.colu').factory('insight', function ($http, profileService) {

  function Insight(opts) {
    this.network = opts.network || 'livenet';
    this.url = opts.url;
  }

  Insight.prototype.getTransaction = function(txid, cb) {
    var url = this.url + '/api/tx/' + txid;

    $http.get(url)
        .success(function (data, status) {
          if (status != 200) return cb(data);
          return cb(null, data);
        })
        .error(function (data, status) {
          return cb(data);
        });
  };

  var testnetInsight = new Insight({ network: 'testnet', url: 'https://test-insight.bitpay.com' });

  var livenetInsight = new Insight({ network: 'livenet', url: 'https://insight.bitpay.com' });

  return {
    get: function() {
      var fc = profileService.focusedClient;
      return fc.credentials.network == 'testnet' ? testnetInsight : livenetInsight;
    }
  };
});

'use strict';

function UnitSymbol() {}

UnitSymbol.create = function(symbol, pluralSymbol) {
  if (!symbol) {
    return null;
  }
  
  if (symbol instanceof Object) {
    return UnitSymbol.create(symbol.symbol, symbol.pluralSymbol);
  }
  var symbolObj = new UnitSymbol();
  symbolObj.pluralSymbol = pluralSymbol || symbol;
  symbolObj.symbol = symbol;

  return symbolObj;
};

UnitSymbol.DEFAULT = UnitSymbol.create('unit', 'units');

UnitSymbol.prototype.forAmount = function(amount) {
  return amount == 1 ? this.symbol : this.pluralSymbol;
};
'use strict';

angular.module('copayAddon.colu')
    .directive('booleanIcon', function() {
      return {
        restrict: 'E',
        scope: {
          value: '='
        },
        replace: true,
        template: '<span>' +
                    '<i class="fi-check" style="color:green" ng-show="value"></i>' +
                    '<i class="fi-x" style="color:red" ng-show="!value"></i>' +
                  '</span>'
      }
    });
