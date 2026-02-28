const fs = require('fs');
const path = require('path');

// Create abi directory
const abiDir = path.join(__dirname, '..', 'abi');
if (!fs.existsSync(abiDir)) {
  fs.mkdirSync(abiDir);
}

const contracts = ['NexusGame', 'GameConfig'];

contracts.forEach(contractName => {
  const artifactPath = path.join(
    __dirname,
    '..',
    'artifacts',
    'contracts',
    `${contractName}.sol`,
    `${contractName}.json`
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    const abiPath = path.join(abiDir, `${contractName}.json`);
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));

    console.log(`Exported ${contractName} ABI`);
  } else {
    console.log(`${contractName} artifact not found - run 'npm run compile' first`);
  }
});

console.log('\nABI export complete! Files in /abi directory');
