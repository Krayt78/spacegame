const fs = require('fs');
const path = require('path');

// Output directories
const abiDir = path.join(__dirname, '..', 'abi');
const frontendAbiDir = path.join(__dirname, '..', '..', 'frontend', 'src', 'contracts', 'abi');

[abiDir, frontendAbiDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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
    const abiJson = JSON.stringify(artifact.abi, null, 2);

    fs.writeFileSync(path.join(abiDir, `${contractName}.json`), abiJson);
    fs.writeFileSync(path.join(frontendAbiDir, `${contractName}.json`), abiJson);

    console.log(`Exported ${contractName} ABI`);
  } else {
    console.log(`${contractName} artifact not found - run 'npm run compile' first`);
  }
});

console.log('\nABI export complete! Files in /abi and frontend/src/contracts/abi');
