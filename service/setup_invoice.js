const asyncAuto = require('async/auto');

const getAddressDetails = require('./get_address_details');
const {getBlockchainInfo} = require('./../chain');
const getInvoiceDetails = require('./get_invoice_details');
const {returnResult} = require('./../async-util');
const serverSwapKeyPair = require('./server_swap_key_pair');
const {swapAddress} = require('./../swaps');

const network = 'testnet';
const swapRate = 0.015;
const timeoutBlockCount = 144;

/** Setup a invoice

 {
 currency: <Currency Code String>
 capacity: capacity wanted
 pubkey: buyer pubkey
 }

 @returns via cbk
 {
 invoice: <Lightning Invoice String>
 payment_hash: <Payment Hash Hex String>
 seller_hash: sellers p2sh
 }

 */

const {lightningDaemon} = require('./../lightning');
const {createSwap} = require('./create_swap');



module.exports = (args, cbk) => {
    return asyncAuto({

        // Initialize the LN daemon connection
        lnd: cbk => {
            try {
                return cbk(null, lightningDaemon({}));
            } catch (e) {
                return cbk([500, 'FailedToInitLightningDaemonConnection']);
            }
        },

        // lnd will generate the preimage and hash for us behind the scenes.
        createInvoice: [
            'lnd',
            ({lnd}, cbk) =>
                {
                    return createInvoice({
                        lnd,
                        tokens: args.amount, 
                        wss: [],
                    },
                    cbk);
             }],

        // Create on-chain transaction.
        createOnchainTxn: [
            'lnd',
            'createInvoice',
            ({lnd, createInvoice}, cbk) =>
                {
                    return createSwap({
                        currency: 'tBTC', // hard-coded to testnet BTC since nothing else is available yet.
                        invoice: createInvoice.invoice,
                        refund_address: 'mq8a57EyVmzuTUaNPQuoTY9MHg4oWmT52t' // TODO generate refund address for capacity_provider

                    },
                    cbk);
                }],

        // NOTE: If capacity_buyer never fulfills the invoice, the capacity_provider should reclaim funds
        // from the onchain transaction.

        // Return JSON results.
        results: [
            'createInvoice',
            ({createInvoice}, cbk) =>
                {
                    return cbk(null, {
                        invoice: createInvoice.invoice,
                        payment_hash: createInvoice.id,
                        p2sh_address: createInvoice.swap_p2sh_address,
                    });
                }],
    },
  returnResult({of: 'results'}, cbk));
};

