// simulateEcoDriveChallenge.js

const hre = require("hardhat");
const xrpl = require("xrpl");
require("dotenv").config();

// Environment Variables
const {
    XRPL_DESTINATION_ADDRESS, // Should be the redistribution wallet address
    PARTICIPANT1_XRP_SECRET,
    PARTICIPANT2_XRP_SECRET,
    REDISTRIBUTION_XRP_SECRET,
  } = process.env;

async function main() {
  // Deploying the smart contract
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const EcoDriveChallenge = await hre.ethers.getContractFactory("EcoDriveChallenge");

  const minimumPoints = 100;
  const currentTime = Math.floor(Date.now() / 1000);
  const startTime = currentTime + 10; // Starts in 10 seconds
  const durationSeconds = 30; // Duration of 30 seconds for testing
  const endTime = startTime + durationSeconds;
  const stakeAmount = xrpl.xrpToDrops("1"); // "1000000" drops

  console.log("Deploying contract with the following parameters:");
  console.log(`- Minimum Points: ${minimumPoints}`);
  console.log(`- Start Time: ${startTime} (${new Date(startTime * 1000).toLocaleString()})`);
  console.log(`- End Time: ${endTime} (${new Date(endTime * 1000).toLocaleString()})`);
  console.log(`- Stake Amount: ${xrpl.dropsToXrp(stakeAmount)} XRP`);

  const ecoDriveChallenge = await EcoDriveChallenge.deploy(
    minimumPoints,
    startTime,
    endTime,
    stakeAmount
  );

  await ecoDriveChallenge.deployed();
  console.log("Contract deployed at address:", ecoDriveChallenge.address);

  // Connecting to the XRPL network
  console.log("\nConnecting to the XRPL network...");
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233"); // Testnet
  await client.connect();
  console.log("Connected to the XRPL network.");

  // Participant accounts
  const participant1 = {
    xrpSecret: PARTICIPANT1_XRP_SECRET,
    xrpWallet: null,
    xrpAddress: null,
    escrowSequence: null,
  };

  const participant2 = {
    xrpSecret: PARTICIPANT2_XRP_SECRET,
    xrpWallet: null,
    xrpAddress: null,
    escrowSequence: null,
  };

  // Redistribution wallet
  const redistributionWallet = xrpl.Wallet.fromSeed(REDISTRIBUTION_XRP_SECRET);
  const redistributionAddress = redistributionWallet.address;

  // Initializing participants' XRP wallets
  participant1.xrpWallet = xrpl.Wallet.fromSeed(participant1.xrpSecret);
  participant1.xrpAddress = participant1.xrpWallet.address;

  participant2.xrpWallet = xrpl.Wallet.fromSeed(participant2.xrpSecret);
  participant2.xrpAddress = participant2.xrpWallet.address;

  console.log("\nParticipants XRP Addresses:");
  console.log(`Participant 1: ${participant1.xrpAddress}`);
  console.log(`Participant 2: ${participant2.xrpAddress}`);
  console.log(`Redistribution Wallet: ${redistributionAddress}`);

  // Registering participants and creating escrows
  console.log("\nRegistering participants and creating escrows...");

  // Calculating the remaining time until the challenge ends
  const timeUntilEnd = endTime - Math.floor(Date.now() / 1000);
  const cancelAfterSeconds = timeUntilEnd + 10; // Adding a 10-second buffer

  await registerParticipant(
    client,
    ecoDriveChallenge,
    participant1,
    stakeAmount,
    redistributionAddress, // Destination to the redistribution wallet
    timeUntilEnd,
    cancelAfterSeconds
  );

  await registerParticipant(
    client,
    ecoDriveChallenge,
    participant2,
    stakeAmount,
    redistributionAddress, // Destination to the redistribution wallet
    timeUntilEnd,
    cancelAfterSeconds
  );

  // Waiting for the challenge to start
  console.log("\nWaiting for the challenge to start...");
  await sleep(15000); // Wait for 15 seconds

  // Simulating adding points
  console.log("\nAdding points to participants...");

  // Adding points for participant 1 (winner)
  const txAddPoints1 = await ecoDriveChallenge.addPoints(1, participant1.xrpAddress, 150); // More than the minimum
  await txAddPoints1.wait();
  console.log(`Added 150 points to ${participant1.xrpAddress}`);

  // Adding points for participant 2 (loser)
  const txAddPoints2 = await ecoDriveChallenge.addPoints(1, participant2.xrpAddress, 80); // Less than the minimum
  await txAddPoints2.wait();
  console.log(`Added 80 points to ${participant2.xrpAddress}`);

  // Waiting for the challenge to end and the time for `CancelAfter`
  console.log("\nWaiting for the challenge to end and the CancelAfter time...");
  await sleep(cancelAfterSeconds * 1000); // Wait until after CancelAfter

  // Determining the winners
  console.log("\nDetermining the winners...");
  const txDetermineWinners = await ecoDriveChallenge.determineWinners(1);
  await txDetermineWinners.wait();

  const winners = await ecoDriveChallenge.getWinners(1);
  console.log("Winners of Challenge 1:", winners);

  // Finishing escrows and distributing funds to the winners
  console.log("\nFinishing escrows and distributing funds to the winners...");

  await finishEscrowsAndDistributeFunds(client, [participant1, participant2], winners, redistributionWallet);

  // Disconnecting the XRPL client
  await client.disconnect();
  console.log("\nDisconnected from the XRPL network.");
}

async function registerParticipant(
  client,
  contract,
  participant,
  stakeAmount,
  destinationAddress,
  finishAfterSeconds,
  cancelAfterSeconds
) {
  // Creating an escrow for the participant
  console.log(`\nCreating an escrow for ${participant.xrpAddress}...`);
  const escrowSequence = await createEscrow(
    client,
    participant.xrpWallet,
    destinationAddress,
    "1000000", // Amount in drops (1 XRP)
    finishAfterSeconds,
    cancelAfterSeconds
  );
  participant.escrowSequence = escrowSequence;

  // Registering the participant in the smart contract
  const tx = await contract.register(1, participant.xrpAddress, {
    value: stakeAmount,
  });
  await tx.wait();
  console.log(`Participant (${participant.xrpAddress}) registered for Challenge 1`);
}

async function createEscrow(client, wallet, destination, amount, finishAfterSeconds, cancelAfterSeconds) {
  // Calculating FinishAfter and CancelAfter in seconds since Ripple epoch
  const RIPPLE_EPOCH = 946684800;
  const currentTimeSeconds = Math.floor(Date.now() / 1000);
  const finishAfter = currentTimeSeconds - RIPPLE_EPOCH + finishAfterSeconds;
  const cancelAfter = currentTimeSeconds - RIPPLE_EPOCH + cancelAfterSeconds;

  const escrowCreateTx = {
    TransactionType: "EscrowCreate",
    Account: wallet.address,
    Destination: destination,
    Amount: amount, // Amount in drops
    FinishAfter: finishAfter,
    CancelAfter: cancelAfter, // Adding CancelAfter
  };

  console.log("Preparing escrow transaction...");
  const prepared = await client.autofill(escrowCreateTx, { maxLedgerVersionOffset: 10 });
  console.log("Transaction prepared.");

  console.log("Signing transaction...");
  const signed = wallet.sign(prepared);

  console.log("Submitting escrow transaction...");
  const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });

  if (result.result.meta.TransactionResult === "tesSUCCESS") {
    console.log("Escrow created successfully!");
    const escrowSequence = prepared.Sequence;
    return escrowSequence;
  } else {
    throw new Error(
      `Failed to create escrow: ${result.result.meta.TransactionResult}`
    );
  }
}

async function finishEscrowsAndDistributeFunds(client, participants, winners, redistributionWallet) {
    // Redistribution address
    const redistributionAddress = redistributionWallet.address;
  
    for (const participant of participants) {
      // Check if the participant is a winner
      const isWinner = winners.includes(participant.xrpAddress);
  
      if (isWinner) {
        // Cancel the escrow to return funds to the winner
        await cancelEscrow(client, participant.xrpWallet, participant.escrowSequence);
        console.log(`Participant ${participant.xrpAddress} is a winner. Funds returned.`);
      } else {
        // Finish the escrow to send funds to the redistribution wallet
        await finishEscrow(client, participant.xrpWallet, participant.escrowSequence);
        console.log(`Participant ${participant.xrpAddress} did not win. Funds transferred to the redistribution address.`);
      }
    }
  
    // Check the balance of the redistribution wallet
    const balance = await client.getXrpBalance(redistributionAddress);
    console.log(`\nRedistribution wallet balance before redistribution: ${balance} XRP`);

    // Redistribute funds to the winners
    if (winners.length > 0) {
      await redistributeFunds(client, redistributionWallet, winners);
    } else {
      console.log("No winners to redistribute.");
    }

    // Check the balance after redistribution
    const balanceAfter = await client.getXrpBalance(redistributionAddress);
    console.log(`\nRedistribution wallet balance after redistribution: ${balanceAfter} XRP`);
  }

  async function redistributeFunds(client, redistributionWallet, winners) {
    // Total amount to distribute (from the redistribution wallet)
    const balance = await client.getXrpBalance(redistributionWallet.address);
    const totalAmountDrops = xrpl.xrpToDrops(balance);

    if (totalAmountDrops === '0') {
      console.log("No funds to redistribute.");
      return;
    }

    // Calculate the amount per winner
    const amountPerWinnerDrops = Math.floor(parseInt(totalAmountDrops) / winners.length).toString();

    console.log(`Redistributing ${xrpl.dropsToXrp(amountPerWinnerDrops)} XRP to each winner...`);

    for (const winnerAddress of winners) {
      const paymentTx = {
        TransactionType: "Payment",
        Account: redistributionWallet.address,
        Destination: winnerAddress,
        Amount: amountPerWinnerDrops,
      };

      console.log(`Preparing payment to ${winnerAddress}...`);
      const prepared = await client.autofill(paymentTx, { maxLedgerVersionOffset: 20 });

      console.log("Signing payment transaction...");
      const signed = redistributionWallet.sign(prepared);

      console.log("Submitting payment transaction...");
      const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });

      if (result.result.meta.TransactionResult === "tesSUCCESS") {
        console.log(`Payment to ${winnerAddress} succeeded!`);
      } else {
        console.error(
          `Payment to ${winnerAddress} failed: ${result.result.meta.TransactionResult}`
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
  
    console.log(`Preparing EscrowCancel transaction for escrow ${escrowSequence}...`);
    const prepared = await client.autofill(escrowCancelTx, { maxLedgerVersionOffset: 20 });
  
    console.log("Signing EscrowCancel transaction...");
    const signed = wallet.sign(prepared);
  
    console.log("Submitting EscrowCancel transaction...");
    const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });
  
    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log(`Escrow ${escrowSequence} canceled successfully!`);
    } else {
      console.error(
        `Failed to cancel escrow ${escrowSequence}: ${result.result.meta.TransactionResult}`
      );
    }
  }
  
  async function finishEscrow(client, wallet, escrowSequence) {
    const escrowFinishTx = {
      TransactionType: "EscrowFinish",
      Account: wallet.address,
      Owner: wallet.address,
      OfferSequence: escrowSequence,
    };
  
    console.log(`Preparing EscrowFinish transaction for escrow ${escrowSequence}...`);
    const prepared = await client.autofill(escrowFinishTx, { maxLedgerVersionOffset: 20 });
  
    console.log("Signing EscrowFinish transaction...");
    const signed = wallet.sign(prepared);
  
    console.log("Submitting EscrowFinish transaction...");
    const result = await client.submitAndWait(signed.tx_blob, { timeout: 60 });
  
    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log(`Escrow ${escrowSequence} finished successfully!`);
    } else {
      console.error(
        `Failed to finish escrow ${escrowSequence}: ${result.result.meta.TransactionResult}`
      );
    }
  }
  
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in the script:", error);
    process.exit(1);
  });
