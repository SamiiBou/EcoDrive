const xrpl = require('xrpl');

console.log('Nous sommes ici');

const printMoney = async ({ destinationWallet, client }) => {
  try {
    // Créez un portefeuille source financé via le faucet
    const { wallet: sourceWallet, balance: sourceBalance } = await client.fundWallet();
    
    console.log("Portefeuille Source:", sourceWallet.classicAddress);
    console.log("Solde Source (en drops):", sourceBalance);
    console.log("Solde Source (en XRP):", xrpl.dropsToXrp(sourceBalance), "XRP");

    // Pause pour s'assurer que le solde est bien crédité
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Créez une transaction de paiement
    const tx = {
      TransactionType: "Payment",
      Account: sourceWallet.classicAddress,
      Destination: destinationWallet.classicAddress,
      Amount: xrpl.xrpToDrops("90"), // Transférer 90 XRP
    };

    console.log("Soumission de la transaction de paiement:", tx);

    // Soumettez la transaction et attendez qu'elle soit validée
    const result = await client.submitAndWait(tx, { wallet: sourceWallet });

    console.log("Résultat de la transaction:", result);

    // Vérifiez si la transaction a réussi
    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("Transfert réussi !");
    } else {
      console.log("Échec du transfert :", result.result.meta.TransactionResult);
    }

  } catch (error) {
    console.error("Erreur dans printMoney:", error);
  }
};

async function createWallet() {
  const client = new xrpl.Client('wss://s.altnet.rippletest.net:51233'); 
  await client.connect();
  console.log("Connecté au XRP Ledger Testnet");

  // Générez un nouveau portefeuille de destination
  const destinationWallet = xrpl.Wallet.generate();
  console.log('Adresse du portefeuille de destination:', destinationWallet.classicAddress);
  console.log('Secret du portefeuille de destination:', destinationWallet.seed);

  // Essayer de récupérer le solde initial du portefeuille de destination
  try {
    const initialBalances = await client.getBalances(destinationWallet.classicAddress);
    console.log('Soldes initiaux du portefeuille de destination:', initialBalances);
  } catch (error) {
    if (error.data && error.data.error === 'actNotFound') {
      console.log('Le portefeuille de destination n\'existe pas encore. Solde initial: 0 XRP');
    } else {
      console.error("Erreur lors de la récupération des soldes initiaux:", error);
      await client.disconnect();
      return;
    }
  }

  // Ajoutez des fonds supplémentaires au portefeuille de destination
  await printMoney({ destinationWallet, client });

  // Obtenez et loggez le solde final du portefeuille de destination
  try {
    const finalBalances = await client.getBalances(destinationWallet.classicAddress);
    console.log('Soldes finaux du portefeuille de destination:', finalBalances);
  } catch (error) {
    if (error.data && error.data.error === 'actNotFound') {
      console.log('Le portefeuille de destination n\'existe toujours pas après le transfert.');
    } else {
      console.error("Erreur lors de la récupération des soldes finaux:", error);
    }
  }

  // Déconnectez-vous du client
  await client.disconnect();
  console.log("Déconnecté du XRP Ledger Testnet");
}

createWallet();
