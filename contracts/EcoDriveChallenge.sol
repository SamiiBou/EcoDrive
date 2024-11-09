// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EcoDriveChallenge {
    address public owner;

    struct Challenge {
        uint256 id;
        uint256 minimumPoints;
        uint256 startTime;
        uint256 endTime;
        uint256 stakeAmount;
        bool isActive;
    }

    struct Participant {
        string xrpAddress;
        uint256 points;
        bool hasParticipated;
        bool isWinner;
    }

    uint256 public challengeCount;
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => mapping(string => Participant)) public participants;
    mapping(uint256 => string[]) public participantAddresses;

    event ChallengeCreated(
        uint256 id,
        uint256 minimumPoints,
        uint256 startTime,
        uint256 endTime,
        uint256 stakeAmount
    );

    event ParticipantRegistered(
        uint256 challengeId,
        string xrpAddress
    );

    event PointsAdded(
        uint256 challengeId,
        string xrpAddress,
        uint256 pointsAdded,
        uint256 totalPoints
    );

    event PointsRemoved(
        uint256 challengeId,
        string xrpAddress,
        uint256 pointsRemoved,
        uint256 totalPoints
    );

    constructor(
        uint256 _minimumPoints,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _stakeAmount
    ) {
        owner = msg.sender;
        challengeCount = 1;
        challenges[challengeCount] = Challenge({
            id: challengeCount,
            minimumPoints: _minimumPoints,
            startTime: _startTime,
            endTime: _endTime,
            stakeAmount: _stakeAmount,
            isActive: true
        });

        emit ChallengeCreated(
            challengeCount,
            _minimumPoints,
            _startTime,
            _endTime,
            _stakeAmount
        );
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function");
        _;
    }

    function createChallenge(
        uint256 _minimumPoints,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _stakeAmount
    ) public onlyOwner {
        require(_endTime > _startTime, "End time must be after start time");
        require(_stakeAmount > 0, "Stake amount must be greater than zero");

        challengeCount += 1;
        challenges[challengeCount] = Challenge({
            id: challengeCount,
            minimumPoints: _minimumPoints,
            startTime: _startTime,
            endTime: _endTime,
            stakeAmount: _stakeAmount,
            isActive: true
        });

        emit ChallengeCreated(
            challengeCount,
            _minimumPoints,
            _startTime,
            _endTime,
            _stakeAmount
        );
    }

    function register(uint256 _challengeId, string memory _xrpAddress) public {
    Challenge storage challenge = challenges[_challengeId];
    require(challenge.isActive, "Challenge is not active");
    require(block.timestamp < challenge.startTime, "Registration period is over");
    require(!participants[_challengeId][_xrpAddress].hasParticipated, "Already registered");

    participants[_challengeId][_xrpAddress] = Participant({
        xrpAddress: _xrpAddress,
        points: 0,
        hasParticipated: true,
        isWinner: false
    });
    participantAddresses[_challengeId].push(_xrpAddress);

    emit ParticipantRegistered(_challengeId, _xrpAddress);
}


    function getParticipants(uint256 _challengeId) public view returns (string[] memory) {
        require(_challengeId > 0 && _challengeId <= challengeCount, "Invalid challenge");
        return participantAddresses[_challengeId];
    }

    function addPoints(
        uint256 _challengeId,
        string memory _xrpAddress,
        uint256 _points
    ) public onlyOwner {
        Challenge storage challenge = challenges[_challengeId];
        require(challenge.isActive, "Challenge is not active");
        require(block.timestamp <= challenge.endTime, "Challenge has ended");
        require(_points > 0, "Points must be greater than zero");

        Participant storage participant = participants[_challengeId][_xrpAddress];
        require(participant.hasParticipated, "Participant not registered");

        participant.points += _points;

        emit PointsAdded(_challengeId, _xrpAddress, _points, participant.points);
    }

    function removePoints(
        uint256 _challengeId,
        string memory _xrpAddress,
        uint256 _points
    ) public onlyOwner {
        Challenge storage challenge = challenges[_challengeId];
        require(challenge.isActive, "Challenge is not active");
        require(block.timestamp <= challenge.endTime, "Challenge has ended");
        require(_points > 0, "Points must be greater than zero");

        Participant storage participant = participants[_challengeId][_xrpAddress];
        require(participant.hasParticipated, "Participant not registered");
        require(participant.points >= _points, "Insufficient points to remove");

        participant.points -= _points;

        emit PointsRemoved(_challengeId, _xrpAddress, _points, participant.points);
    }

    function determineWinners(uint256 _challengeId) public onlyOwner {
        Challenge storage challenge = challenges[_challengeId];
        require(block.timestamp > challenge.endTime, "Challenge is not yet ended");
        require(challenge.isActive, "Challenge is not active");

        string[] storage addresses = participantAddresses[_challengeId];
        for (uint256 i = 0; i < addresses.length; i++) {
            Participant storage participant = participants[_challengeId][addresses[i]];
            if (participant.points >= challenge.minimumPoints) {
                participant.isWinner = true;
            }
        }

        challenge.isActive = false;
    }

    function getWinners(uint256 _challengeId) public view returns (string[] memory) {
    Challenge storage challenge = challenges[_challengeId];
    require(!challenge.isActive, "Challenge is still active");

    string[] memory tempWinners = new string[](participantAddresses[_challengeId].length);
    uint256 count = 0;

    for (uint256 i = 0; i < participantAddresses[_challengeId].length; i++) {
        string memory addr = participantAddresses[_challengeId][i];
        if (participants[_challengeId][addr].isWinner) {
            tempWinners[count] = addr;
            count++;
        }
    }

    string[] memory winners = new string[](count);
    for (uint256 j = 0; j < count; j++) {
        winners[j] = tempWinners[j];
    }

    return winners;
}


}
