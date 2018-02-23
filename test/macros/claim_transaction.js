const bip65Encode = require('bip65').encode;
const {address, crypto, ECPair, networks, script} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const chain = require('./../conf/chain');

const hashAll = Transaction.SIGHASH_ALL;
const {testnet} = networks;
const {toOutputScript} = address;
const {sha256} = crypto;
const {witnessScriptHash} = script;

const ecdsaSignatureLength = chain.ecdsa_sig_max_byte_length;
const sequenceLength = chain.sequence_byte_length;
const shortPushdataLength = chain.short_push_data_length;
const vRatio = chain.witness_byte_discount_denominator;

/** Make a claim chain swap output transaction that completes a swap

  {
    current_block_height: <Current Block Height Number>
    destination: <Send Tokens to Address String>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    redeem_script: <Redeem Script Hex>
    preimage: <Payment Preimage Hex String>
    private_key: <Claim Private Key WIF String>
    redeem_script: <Redeem Script Hex Serialized String>
    utxos: [{
      tokens: <Tokens Number>
      transaction_id: <Transaction Id String>
      vout: <Vout Number>
    }]
  }

  @returns via cbk
  {
    transaction: <Sweep Transaction Hex Serialized String>
  }
*/
module.exports = (args, cbk) => {
  if (!args.utxos.length) {
    return cbk([0, 'Expected funding tx utxos']);
  }

  const lockTime = bip65Encode({blocks: args.current_block_height});
  const preimage = Buffer.from(args.preimage, 'hex');
  const script = Buffer.from(args.redeem_script, 'hex');
  const scriptPub = toOutputScript(args.destination, testnet);
  const signingKey = ECPair.fromWIF(args.private_key, testnet);
  const tokens = args.utxos.reduce((sum, n) => n.tokens + sum, 0);
  const tokensPerVirtualByte = args.fee_tokens_per_vbyte;
  const transaction = new Transaction();

  args.utxos
    .map(n => ({txId: Buffer.from(n.transaction_id, 'hex'), vout: n.vout}))
    .forEach(n => transaction.addInput(n.txId.reverse(), n.vout));

  transaction.addOutput(scriptPub, tokens);

  const prevPub = witnessScriptHash.output.encode(sha256(script));
  transaction.locktime = lockTime;

  // Anticipate the final weight of the transaction
  const anticipatedWeight = args.utxos.reduce((sum, n) => {
    return [
      shortPushdataLength,
      ecdsaSignatureLength,
      shortPushdataLength,
      preimage.length,
      sequenceLength,
      script.length,
      sum,
    ].reduce((sum, n) => sum + n);
  },
  transaction.weight());

  // Reduce the final output value to give some tokens over to fees
  const [out] = transaction.outs;

  out.value -= tokensPerVirtualByte * Math.ceil(anticipatedWeight / vRatio);

  // Sign each input
  args.utxos.forEach(({tokens}, i) => {
    const sigHash = transaction.hashForWitnessV0(i, script, tokens, hashAll);

    const signature = signingKey.sign(sigHash).toScriptSignature(hashAll);

    return [[signature, preimage, script]]
      .forEach((witness, i) => transaction.setWitness(i, witness));
  });

  return cbk(null, {transaction: transaction.toHex()});
};
