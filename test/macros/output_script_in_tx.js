const {crypto, script, Transaction} = require('bitcoinjs-lib');

const {sha256} = crypto;
const {witnessScriptHash} = script;

/** Find outputs with matching script in transaction

  {
    redeem_script: <Redeem Script For ScriptPub Hex String>
    transaction: <Transaction Hex String>
  }

  @returns via cbk
  {
    matching_outputs: [{
      script: <ScriptPub Buffer>
      tokens: <Tokens Number>
      transaction_id: <Transaction Id String>
      vout: <Vout Number>
    }]
  }
*/
module.exports = (args, cbk) => {
  if (!args.redeem_script || !args.transaction) {
    return cbk([0, 'Expected redeem script, transaction']);
  }

  const redeemScript = Buffer.from(args.redeem_script, 'hex');

  const witnessScript = witnessScriptHash.output.encode(sha256(redeemScript));

  const transaction = Transaction.fromHex(args.transaction);

  const matchingVouts = transaction.outs
  .map((out, i) => {
    return {
      script: out.script,
      tokens: out.value,
      transaction_id: transaction.getId(),
      vout: i,
    };
  })
  .filter(n => n.script.equals(witnessScript));

  return cbk(null, {matching_outputs: matchingVouts});
};
