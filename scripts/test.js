// simulateEcoDriveChallenge.js

const hre = require("hardhat");
const xrpl = require("xrpl");
require("dotenv").config();

// Variables d'environnement
const {
    XRPL_DESTINATION_ADDRESS,
    PARTICIPANT1_XRP_SECRET,
    PARTICIPANT2_XRP_SECRET,
    REDISTRIBUTION_XRP_SECRET,
  } = process.env;
  
async function main() {
  // Déploiement du contrat intelligent
  const [deployer] = await hre.ethers.getSigners();
  console.log("Déployeur :", deployer.address);

  const EcoDriveChallenge = await hre.ethers.getContractFactory("EcoDriveChallenge");

  const minimumPoints = 100;
  const startTime = Math.floor(Date.now() / 1000) + 10; // Début dans 10 secondes
  const durationSeconds = 30; // Durée de 1 minute pour le test
  const endTime = startTime + durationSeconds;
  const stakeAmount = hre.ethers.utils.parseEther("0.1"); // 0.1 ETH en wei

  console.log("Déploiement du contrat avec les paramètres :");
  console.log(`- Points minimum : ${minimumPoints}`);
  console.log(`- Start Time : ${startTime} (${new Date(startTime * 1000).toLocaleString()})`);
  console.log(`- End Time : ${endTime} (${new Date(endTime * 1000).toLocaleString()})`);
  console.log(`- Stake Amount : ${stakeAmount.toString()} wei`);

  const ecoDriveChallenge = await EcoDriveChallenge.deploy(
    minimumPoints,
    startTime,
    endTime,
    stakeAmount
  );

  await ecoDriveChallenge.deployed();
  console.log("Contrat déployé à l'adresse :", ecoDriveChallenge.address);

  // Connexion au réseau XRPL
  console.log("\nConnexion au réseau XRPL...");
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233"); // Testnet
  await client.connect();
  console.log("Connecté au réseau XRPL.");

  // Comptes des participants
  const participant1 = {
    xrpSecret: PARTICIPANT1_XRP_SECRET,
    xrpWallet: null,
    xrpAddress: null,
  };

  const participant2 = {
    xrpSecret: PARTICIPANT2_XRP_SECRET,
    xrpWallet: null,
    xrpAddress: null,
  };

  // Initialisation des portefeuilles XRP des participants
  participant1.xrpWallet = xrpl.Wallet.fromSeed(participant1.xrpSecret);
  participant1.xrpAddress = participant1.xrpWallet.address;

  participant2.xrpWallet = xrpl.Wallet.fromSeed(participant2.xrpSecret);
  participant2.xrpAddress = participant2.xrpWallet.address;

  console.log("\nParticipants XRP Addresses:");
  console.log(`Participant 1: ${participant1.xrpAddress}`);
  console.log(`Participant 2: ${participant2.xrpAddress}`);

  // Enregistrement des participants et création des escrows
  console.log("\nEnregistrement des participants et création des escrows...");

  await registerParticipant(
    client,
    ecoDriveChallenge,
    participant1,
    stakeAmount,
    XRPL_DESTINATION_ADDRESS,
    endTime
  );

  await registerParticipant(
    client,
    ecoDriveChallenge,
    participant2,
    stakeAmount,
    XRPL_DESTINATION_ADDRESS,
    endTime
  );

  // Attendre le début du défi
  console.log("\nAttente du début du défi...");
  await sleep(15000); // Attendre 15 secondes

  // Simuler l'ajout de points
  console.log("\nAjout de points aux participants...");

  // Ajouter des points pour le participant 1 (gagnant)
  await ecoDriveChallenge.addPoints(1, participant1.xrpAddress, 150); // Plus que le minimum
  console.log(`Ajouté 150 points à ${participant1.xrpAddress}`);

  // Ajouter des points pour le participant 2 (perdant)
  await ecoDriveChallenge.addPoints(1, participant2.xrpAddress, 80); // Moins que le minimum
  console.log(`Ajouté 80 points à ${participant2.xrpAddress}`);

  // Attendre la fin du défi
  console.log("\nAttente de la fin du défi...");
  await sleep(durationSeconds * 1000 + 30000); // Attendre la durée du défi + 5 secondes

  // Déterminer les gagnants
  console.log("\nDétermination des gagnants...");
  const txDetermineWinners = await ecoDriveChallenge.determineWinners(1);
  await txDetermineWinners.wait();
  

  const winners = await ecoDriveChallenge.getWinners(1);
  console.log("Gagnants du défi 1 :", winners);

  // Terminer les escrows et distribuer les fonds aux gagnants
  console.log("\nTerminaison des escrows et distribution des fonds aux gagnants...");

  await finishEscrowsAndDistributeFunds(client, [participant1, participant2], winners);

  // Déconnecter le client XRPL
  await client.disconnect();
  console.log("\nDéconnecté du réseau XRPL.");
}

async function registerParticipant(
  client,
  contract,
  participant,
  stakeAmount,
  destinationAddress,
  challengeEndTime
) {
  // Créer un escrow pour le participant
  console.log(`\nCréation d'un escrow pour ${participant.xrpAddress}...`);
  const escrowSequence = await createEscrow(
    client,
    participant.xrpWallet,
    destinationAddress,
    "1000000", // Montant en drops (1 XRP)
    challengeEndTime - Math.floor(Date.now() / 1000) // Temps restant jusqu'à la fin du défi
  );
  participant.escrowSequence = escrowSequence;

  // Enregistrer le participant dans le contrat intelligent
  const tx = await contract.register(1, participant.xrpAddress, {
    value: stakeAmount,
  });
  await tx.wait();
  console.log(`Participant (${participant.xrpAddress}) inscrit au défi 1`);
}

async function createEscrow(client, wallet, destination, amount, finishAfterSeconds) {
  // Calcul de FinishAfter en secondes depuis l'époque Ripple
  const RIPPLE_EPOCH = 946684800;
  const currentTimeSeconds = Math.floor(Date.now() / 1000);
  const finishAfter = currentTimeSeconds - RIPPLE_EPOCH + finishAfterSeconds + 5;

  const escrowCreateTx = {
    TransactionType: "EscrowCreate",
    Account: wallet.address,
    Destination: destination,
    Amount: amount, // Montant en drops
    FinishAfter: finishAfter,
  };

  console.log("Préparation de la transaction d'escrow...");
  const prepared = await client.autofill(escrowCreateTx, { maxLedgerVersionOffset: 10 });
  console.log("Transaction préparée.");

  console.log("Signature de la transaction...");
  const signed = wallet.sign(prepared);

  console.log("Soumission de la transaction d'escrow...");
  const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });

  if (result.result.meta.TransactionResult === "tesSUCCESS") {
    console.log("Escrow créé avec succès!");
    const escrowSequence = prepared.Sequence;
    return escrowSequence;
  } else {
    throw new Error(
      `Échec de la création de l'escrow: ${result.result.meta.TransactionResult}`
    );
  }
}

async function finishEscrowsAndDistributeFunds(client, participants, winners) {
    // Adresse de redistribution
    const redistributionWallet = xrpl.Wallet.fromSeed(process.env.REDISTRIBUTION_XRP_SECRET);
    const redistributionAddress = redistributionWallet.address;
  
    for (const participant of participants) {
      // Vérifier si le participant est un gagnant
      const isWinner = winners.includes(participant.xrpAddress);
  
      if (isWinner) {
        // Annuler l'escrow pour retourner les fonds au gagnant
        await cancelEscrow(client, participant.xrpWallet, participant.escrowSequence);
        console.log(`Le participant ${participant.xrpAddress} est un gagnant. Fonds retournés.`);
      } else {
        // Terminer l'escrow pour envoyer les fonds à l'adresse de redistribution
        await finishEscrow(client, participant.xrpWallet, participant.escrowSequence, redistributionAddress);
        console.log(`Le participant ${participant.xrpAddress} n'a pas gagné. Fonds transférés à l'adresse de redistribution.`);
      }
    }
  
    // Redistribuer les fonds aux gagnants
    await redistributeFunds(client, redistributionWallet, winners);
  }

  async function redistributeFunds(client, redistributionWallet, winners) {
    // Montant total à distribuer (à récupérer via les transactions précédentes ou solde du wallet)
    const balance = await client.getXrpBalance(redistributionWallet.address);
    const totalAmountDrops = xrpl.xrpToDrops(balance);
  
    if (totalAmountDrops === '0') {
      console.log("Aucun fonds à redistribuer.");
      return;
    }
  
    // Calculer le montant par gagnant
    const amountPerWinnerDrops = Math.floor(parseInt(totalAmountDrops) / winners.length).toString();
  
    console.log(`Redistribution de ${xrpl.dropsToXrp(amountPerWinnerDrops)} XRP à chaque gagnant...`);
  
    for (const winnerAddress of winners) {
      const paymentTx = {
        TransactionType: "Payment",
        Account: redistributionWallet.address,
        Destination: winnerAddress,
        Amount: amountPerWinnerDrops,
      };
  
      console.log(`Préparation du paiement à ${winnerAddress}...`);
      const prepared = await client.autofill(paymentTx, { maxLedgerVersionOffset: 20 });
  
      console.log("Signature de la transaction de paiement...");
      const signed = redistributionWallet.sign(prepared);
  
      console.log("Soumission de la transaction de paiement...");
      const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });
  
      if (result.result.meta.TransactionResult === "tesSUCCESS") {
        console.log(`Paiement à ${winnerAddress} réussi!`);
      } else {
        console.error(
          `Échec du paiement à ${winnerAddress}: ${result.result.meta.TransactionResult}`
        );
      }
    }
  }
  

  async function cancelEscrow(client, wallet, escrowSequence) {
    const escrowCancelTx = {
      TransactionType: "EscrowCancel",
      Account: wallet.address,
      Owner: wallet.address,
      OfferSequence: escrowSequence,
    };
  
    console.log(`Préparation de la transaction EscrowCancel pour l'escrow ${escrowSequence}...`);
    const prepared = await client.autofill(escrowCancelTx, { maxLedgerVersionOffset: 20 });
  
    console.log("Signature de la transaction EscrowCancel...");
    const signed = wallet.sign(prepared);
  
    console.log("Soumission de la transaction EscrowCancel...");
    const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });
  
    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log(`Escrow ${escrowSequence} annulé avec succès!`);
    } else {
      console.error(
        `Échec de l'annulation de l'escrow ${escrowSequence}: ${result.result.meta.TransactionResult}`
      );
    }
  }
  
  

  async function finishEscrow(client, wallet, escrowSequence, destinationAddress) {
    const escrowFinishTx = {
      TransactionType: "EscrowFinish",
      Account: wallet.address,
      Owner: wallet.address,
      OfferSequence: escrowSequence,
      Destination: destinationAddress, // Spécifier l'adresse de destination
    };
  
    console.log(`Préparation de la transaction EscrowFinish pour l'escrow ${escrowSequence}...`);
    const prepared = await client.autofill(escrowFinishTx, { maxLedgerVersionOffset: 20 });
  
    console.log("Signature de la transaction EscrowFinish...");
    const signed = wallet.sign(prepared);
  
    console.log("Soumission de la transaction EscrowFinish...");
    const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });
  
    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log(`Escrow ${escrowSequence} terminé avec succès!`);
    } else {
      console.error(
        `Échec de la terminaison de l'escrow ${escrowSequence}: ${result.result.meta.TransactionResult}`
      );
    }
  }
  
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erreur dans le script :", error);
    process.exit(1);
  });
