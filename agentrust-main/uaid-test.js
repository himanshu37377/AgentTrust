import { HCS14Client } from '@hashgraphonline/standards-sdk';

const hcs14 = new HCS14Client();

async function run() {
  const uaid = await hcs14.createUaid(
    {
      registry: 'microsoft',
      name: 'Customer Support Assistant',
      version: '1.0.0',
      protocol: 'a2a',
      nativeId: 'microsoft.com',
      skills: [0, 17, 19],
    },
    { uid: 'customer-support-assistant' },
  );

  console.log("Generated UAID:", uaid);
}

run();
