const fs = require('fs');
const path = require('path');
const axios = require('axios');
const StellarSdk = require('stellar-sdk');

const WALLET_FILE = path.join(__dirname, 'wallets.json');
const ENV_FILE = path.join(__dirname, '..', '..', 'backend', '.env');
const ENV_EXAMPLE_FILE = path.join(__dirname, '..', '..', 'backend', '.env.example');

// Helper to wait
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateAndFundWallets() {
  console.log('==========================================');
  console.log('Oryn Finance - Demo Wallet Generator');
  console.log('==========================================\n');

  let wallets = {};

  // 1. Check if wallets already exist to make them persistent
  if (fs.existsSync(WALLET_FILE)) {
    try {
      wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
      console.log('📂 Found existing wallets.json. Re-using generated identities.');
    } catch (e) {
      console.warn('⚠️ Error parsing wallets.json. Generating new ones.');
    }
  }

  const roles = ['admin', 'creator', 'trader1', 'trader2'];
  let generatedAny = false;

  roles.forEach(role => {
    if (!wallets[role]) {
      const pair = StellarSdk.Keypair.random();
      wallets[role] = {
        publicKey: pair.publicKey(),
        secretKey: pair.secret(),
        funded: false
      };
      generatedAny = true;
      console.log(`✨ Generated new identity for [${role.toUpperCase()}]: ${wallets[role].publicKey}`);
    } else {
      console.log(`ℹ️  Using existing identity for [${role.toUpperCase()}]: ${wallets[role].publicKey}`);
    }
  });

  if (generatedAny) {
    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2), 'utf8');
    console.log('💾 Wallets saved to scripts/seed/wallets.json\n');
  }

  // 2. Fund unfunded wallets via Friendbot
  console.log('🤖 Requesting testnet funds from Friendbot...');
  for (const role of roles) {
    const wallet = wallets[role];
    
    // Check balance or just request from Friendbot if not marked as funded
    if (!wallet.funded) {
      console.log(`⏳ Funding [${role.toUpperCase()}] wallet (${wallet.publicKey})...`);
      let success = false;
      let attempts = 0;
      
      while (!success && attempts < 3) {
        attempts++;
        try {
          // Friendbot endpoint
          const response = await axios.get(`https://friendbot.stellar.org/?addr=${wallet.publicKey}`, { timeout: 15000 });
          if (response.status === 200) {
            wallet.funded = true;
            success = true;
            console.log(`✅ Funded [${role.toUpperCase()}] successfully!`);
            // Save state immediately
            fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2), 'utf8');
          }
        } catch (error) {
          console.warn(`⚠️ Attempt ${attempts} failed to fund [${role.toUpperCase()}]: ${error.message}`);
          if (attempts < 3) {
            console.log('Waiting 5 seconds before retrying...');
            await sleep(5000);
          }
        }
      }
      
      if (!success) {
        console.error(`❌ Failed to fund [${role.toUpperCase()}] after ${attempts} attempts. You may need to fund it manually.`);
      }
    } else {
      console.log(`✅ [${role.toUpperCase()}] is already funded.`);
    }
  }

  // 3. Update backend/.env file with the admin's secret key
  console.log('\n⚙️ Configuring backend environment variables...');
  
  let envContent = '';
  
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf8');
    console.log('📂 Found existing backend/.env file.');
  } else if (fs.existsSync(ENV_EXAMPLE_FILE)) {
    envContent = fs.readFileSync(ENV_EXAMPLE_FILE, 'utf8');
    console.log('📂 backend/.env not found. Copying from backend/.env.example.');
  } else {
    console.error('❌ Could not find backend/.env or backend/.env.example!');
  }

  if (envContent) {
    // Replace admin key
    if (envContent.includes('ADMIN_SECRET_KEY=')) {
      envContent = envContent.replace(/ADMIN_SECRET_KEY=.*/, `ADMIN_SECRET_KEY=${wallets.admin.secretKey}`);
    } else {
      envContent += `\nADMIN_SECRET_KEY=${wallets.admin.secretKey}`;
    }

    // Set a secure JWT_SECRET if default is still active
    if (envContent.includes('JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars')) {
      const randomSecret = require('crypto').randomBytes(32).toString('hex');
      envContent = envContent.replace('JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars', `JWT_SECRET=${randomSecret}`);
      console.log('🔑 Automatically generated a secure JWT_SECRET.');
    }

    // Ensure MONGODB_URI and REDIS_URL are active
    if (!envContent.includes('MONGODB_URI=')) {
      envContent += '\nMONGODB_URI=mongodb://localhost:27017/oryn-finance';
    }
    if (envContent.includes('#REDIS_URL=')) {
      envContent = envContent.replace('#REDIS_URL=', 'REDIS_URL=');
    } else if (!envContent.includes('REDIS_URL=')) {
      envContent += '\nREDIS_URL=redis://localhost:6379';
    }

    // Add oracle URLs overrides
    const mockOracleEnv = [
      `COINGECKO_API_URL=http://localhost:5005/coingecko`,
      `NEWS_API_URL=http://localhost:5005/news-api`,
      `SPORTS_API_URL=http://localhost:5005/sports-api`
    ];

    mockOracleEnv.forEach(envVar => {
      const prefix = envVar.split('=')[0];
      if (envContent.includes(`${prefix}=`)) {
        envContent = envContent.replace(new RegExp(`${prefix}=.*`), envVar);
      } else {
        envContent += `\n${envVar}`;
      }
    });

    fs.writeFileSync(ENV_FILE, envContent, 'utf8');
    console.log('✅ Updated backend/.env with admin secret key, JWT key, and mock oracle URLs.');
  }

  console.log('\n==========================================');
  console.log('🎉 Demo wallets are ready!');
  console.log('==========================================');
  roles.forEach(role => {
    console.log(`\n👤 [${role.toUpperCase()}]:`);
    console.log(`   Address:    ${wallets[role].publicKey}`);
    console.log(`   Secret Key: ${wallets[role].secretKey}`);
  });
  console.log('\n💡 Tip: Import these secret keys into Freighter to test from the frontend!\n');
}

if (require.main === module) {
  generateAndFundWallets().catch(console.error);
}

module.exports = { generateAndFundWallets };
