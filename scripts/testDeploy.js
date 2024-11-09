const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Déployeur :", deployer.address);

  const EcoDriveChallenge = await hre.ethers.getContractFactory("EcoDriveChallenge");

  const minimumPoints = 100;
  const startTime = Math.floor(Date.now() / 1000) + 3600; // Début dans 1 heure
  const endTime = startTime + (7 * 24 * 60 * 60); // Durée de 7 jours
  const stakeAmount = hre.ethers.utils.parseEther("10"); // 10 ETH en wei

  console.log("Déploiement du contrat avec les paramètres :");
  console.log(`- Points minimum : ${minimumPoints}`);
  console.log(`- Start Time : ${startTime} (${new Date(startTime * 1000).toLocaleString()})`);
  console.log(`- End Time : ${endTime} (${new Date(endTime * 1000).toLocaleString()})`);
  console.log(`- Stake Amount : ${stakeAmount.toString()} wei`);

  const ecoDriveChallenge = await EcoDriveChallenge.connect(deployer).deploy(
    minimumPoints,
    startTime,
    endTime,
    stakeAmount
  );

  await ecoDriveChallenge.deployed();
  console.log("Contrat déployé à l'adresse :", ecoDriveChallenge.address);

  const participant1XRPAddress = "rUYAwHiqSqvXYwhCBC23fmBxGea1ETmZLU";
  const participant2XRPAddress = "r9bfirz1Ws55T9r4ZPRaUrBuNdgsxc9xqh";

  console.log("\nInscription des participants...");
  const tx1 = await ecoDriveChallenge.register(1, participant1XRPAddress, {
    value: stakeAmount
  });
  await tx1.wait();
  console.log(`Participant1 (${participant1XRPAddress}) inscrit au défi 1`);

  const tx2 = await ecoDriveChallenge.register(1, participant2XRPAddress, {
    value: stakeAmount
  });
  await tx2.wait();
  console.log(`Participant2 (${participant2XRPAddress}) inscrit au défi 1`);

  console.log("\nRécupération de la liste des participants au défi 1...");
  const participants = await ecoDriveChallenge.getParticipants(1);
  console.log(`Participants inscrits au défi 1 :`);

  const participantsWithPoints = [];

  for (const xrpAddress of participants) {
    const participant = await ecoDriveChallenge.participants(1, xrpAddress);
    participantsWithPoints.push({
      xrpAddress: participant.xrpAddress,
      points: participant.points.toString()
    });
  }

  participantsWithPoints.forEach((participant, index) => {
    console.log(`${index + 1}. Adresse XRP : ${participant.xrpAddress}, Points : ${participant.points}`);
  });

  // Attendre le début du challenge pour pouvoir ajouter et retirer des points
  console.log("\nAvancement du temps pour permettre l'ajout et la réduction de points...");
  // Simuler l'avancement du temps si possible, sinon assurer que le test est effectué après le startTime

  // Ajout de points
  console.log("\nAjout de points aux participants...");
  for (const participant of participants) {
    // Récupérer les points avant ajout
    const beforeAdd = (await ecoDriveChallenge.participants(1, participant)).points.toString();
    console.log(`Avant ajout : ${participant} a ${beforeAdd} points`);

    // Ajouter 50 points
    const addTx = await ecoDriveChallenge.addPoints(1, participant, 50);
    await addTx.wait();

    // Récupérer les points après ajout
    const afterAdd = (await ecoDriveChallenge.participants(1, participant)).points.toString();
    console.log(`Après ajout : ${participant} a ${afterAdd} points`);
  }

  // Réduction de points
  console.log("\nRéduction de points aux participants...");
  for (const participant of participants) {
    // Récupérer les points avant réduction
    const beforeRemove = (await ecoDriveChallenge.participants(1, participant)).points.toString();
    console.log(`Avant réduction : ${participant} a ${beforeRemove} points`);

    // Retirer 20 points
    const removeTx = await ecoDriveChallenge.removePoints(1, participant, 20);
    await removeTx.wait();

    // Récupérer les points après réduction
    const afterRemove = (await ecoDriveChallenge.participants(1, participant)).points.toString();
    console.log(`Après réduction : ${participant} a ${afterRemove} points`);
  }

  // Affichage final des points des participants
  console.log("\nÉtat final des points des participants au défi 1 :");
  const finalParticipants = await ecoDriveChallenge.getParticipants(1);
  const finalParticipantsWithPoints = [];

  for (const xrpAddress of finalParticipants) {
    const participant = await ecoDriveChallenge.participants(1, xrpAddress);
    finalParticipantsWithPoints.push({
      xrpAddress: participant.xrpAddress,
      points: participant.points.toString()
    });
  }

  finalParticipantsWithPoints.forEach((participant, index) => {
    console.log(`${index + 1}. Adresse XRP : ${participant.xrpAddress}, Points : ${participant.points}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erreur dans le script :", error);
    process.exit(1);
  });
