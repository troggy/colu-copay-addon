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