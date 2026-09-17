export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, style } = req.body;

    if (!imageUrl || !style) {
      return res.status(400).json({ error: 'Missing imageUrl or style' });
    }

    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Map styles to Replicate models
    const styleMap = {
      '3d': 'a9e6c9f63033f5b9c627995cc2f1e0c63a31efc335a9f5f3d0b6c3a4e5f6g7h8',
      'cartoon': 'a9e6c9f63033f5b9c627995cc2f1e0c63a31efc335a9f5f3d0b6c3a4e5f6g7h8',
      'anime': 'a9e6c9f63033f5b9c627995cc2f1e0c63a31efc335a9f5f3d0b6c3a4e5f6g7h8'
    };

    const model = styleMap[style] || styleMap['3d'];

    // Call Replicate API
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: model,
        input: {
          image: imageUrl,
          style: style,
        },
      }),
    });

    if (!replicateResponse.ok) {
      const error = await replicateResponse.json();
      console.error('Replicate API error:', error);
      return res.status(500).json({ error: 'Failed to generate image', details: error });
    }

    const prediction = await replicateResponse.json();

    // Poll for completion
    let finalPrediction = prediction;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes with 1 second intervals

    while (finalPrediction.status !== 'succeeded' && finalPrediction.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const checkResponse = await fetch(`https://api.replicate.com/v1/predictions/${finalPrediction.id}`, {
        headers: {
          'Authorization': `Token ${apiKey}`,
        },
      });

      if (!checkResponse.ok) {
        return res.status(500).json({ error: 'Failed to check generation status' });
      }

      finalPrediction = await checkResponse.json();
      attempts++;
    }

    if (finalPrediction.status === 'failed') {
      return res.status(500).json({ error: 'Image generation failed', details: finalPrediction.error });
    }

    if (finalPrediction.status !== 'succeeded') {
      return res.status(500).json({ error: 'Image generation timeout' });
    }

    // Get the output image URL
    const outputImage = finalPrediction.output?.[0] || finalPrediction.output;

    return res.status(200).json({
      success: true,
      image: outputImage,
      predictionId: finalPrediction.id,
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
  
