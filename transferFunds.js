const xrpl = require('xrpl');

async function transferFunds() {
  const destinationAddress = 'rGvXfnam8WBxQcMZ3RQVurTz1e4Nx51JmT';

  const transferCount = 3;

  const amountXRP = '90';

  const client = new xrpl.Client('wss://s.altnet.rippletest.net:51233');
  await client.connect();
  console.log("Connecté au XRP Ledger Testnet");

  for (let i = 1; i <= transferCount; i++) {
    console.log(`\n--- Transfert ${i} ---`);

    try {
      const { wallet: sourceWallet, balance: sourceBalanceDrops } = await client.fundWallet();

      console.log("Portefeuille Source:", sourceWallet.classicAddress);
      console.log("Solde Source (en drops):", sourceBalanceDrops);
      console.log("Solde Source (en XRP):", xrpl.dropsToXrp(sourceBalanceDrops), "XRP");

      const tx = {
        TransactionType: "Payment",
        Account: sourceWallet.classicAddress,
        Destination: destinationAddress,
        Amount: xrpl.xrpToDrops(amountXRP), 
      };

      console.log("Soumission de la transaction de paiement:", tx);

      const result = await client.submitAndWait(tx, { wallet: sourceWallet });

      console.log("Résultat de la transaction:", result);

      if (result.result.meta.TransactionResult === "tesSUCCESS") {
        console.log("Transfert réussi !");
      } else {
        console.log("Échec du transfert :", result.result.meta.TransactionResult);
      }

      const finalBalances = await client.getBalances(destinationAddress);
      console.log('Soldes finaux du portefeuille de destination:', finalBalances);
    } catch (error) {
      console.error("Erreur lors du transfert:", error);
    }
  }

  await client.disconnect();
  console.log("\nDéconnecté du XRP Ledger Testnet");
}

transferFunds();
