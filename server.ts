import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

interface BriefingRequestBody {
  site: {
    id: string;
    name: string;
    region: string;
    lat: number;
    lon: number;
    elevationM: number;
    safetyScore: number;
    riskLevel: 'safe' | 'caution' | 'high_risk';
    slopeDeg: number;
    roughnessM: number;
    shadowCoveragePct: number;
    solarPowerPct: number;
    commWindowPct: number;
    boulderDensity: number;
    craterProximityM: number;
  };
  missionDate: string;
  solarEarthSummary: {
    sunElevationDeg: number;
    earthElevationDeg: number;
    isSunVisible: boolean;
    isEarthVisible: boolean;
    solarWindowHours: number;
    commWindowHours: number;
  };
  dataSource: {
    sourceType: string;
    sourceName: string;
  };
}

async function generateBriefingWithRetry(payload: BriefingRequestBody, retries = 2) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { site, missionDate, solarEarthSummary, dataSource } = payload;

  const prompt = `You are a senior NASA Lunar Mission Flight Director and Terrain Analyst evaluating candidate landing sites near the Lunar South Pole for Artemis-class robotic and crewed landers.

Evaluate the following site telemetry and return a concise, scientifically grounded, operationally realistic JSON mission briefing:

Site ID: ${site.id} (${site.name})
Region: ${site.region}
Coordinates: ${site.lat.toFixed(3)} deg S, ${site.lon.toFixed(3)} deg E
Elevation: ${site.elevationM.toFixed(0)} m relative to lunar datum
Computed Safety Score: ${site.safetyScore}/100 (Classification: ${site.riskLevel})
Mean Surface Slope: ${site.slopeDeg.toFixed(1)} deg
Surface Roughness (RMS): ${site.roughnessM.toFixed(2)} m
Shadow / PSR Coverage: ${site.shadowCoveragePct.toFixed(1)}%
Boulder Hazard Index: ${site.boulderDensity.toFixed(1)} / 100
Nearest Major Crater Rim Distance: ${site.craterProximityM.toFixed(0)} m
Mission Epoch Date: ${missionDate}
Solar Illumination Window: ${site.solarPowerPct.toFixed(1)}% (${solarEarthSummary.solarWindowHours.toFixed(1)} hrs in lunar day cycle; current Sun elevation ${solarEarthSummary.sunElevationDeg.toFixed(1)} deg, visible=${solarEarthSummary.isSunVisible})
Direct-to-Earth (DTE) Window: ${site.commWindowPct.toFixed(1)}% (${solarEarthSummary.commWindowHours.toFixed(1)} hrs in lunar day cycle; current Earth elevation ${solarEarthSummary.earthElevationDeg.toFixed(1)} deg, visible=${solarEarthSummary.isEarthVisible})
Terrain Data Source: ${dataSource.sourceName} (${dataSource.sourceType})

Guidelines:
- Keep each text field crisp, technical, and concise (1-3 sentences).
- Be transparent in limitations that synthetic/demonstration DEM and simplified horizon ephemeris models require real NASA LOLA DEM, LROC imagery, and JPL SPICE ephemeris for flight certification.
- Ensure site_id matches "${site.id}", safety_score is ${Math.round(site.safetyScore)}, and risk_level matches "${site.riskLevel}".`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an aerospace mission-planning AI providing concise, objective lunar south-pole landing site assessments in strict JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              site_id: {
                type: Type.STRING,
                description: 'Identifier of the candidate landing site.',
              },
              safety_score: {
                type: Type.NUMBER,
                description: 'Overall landing safety score from 0 to 100.',
              },
              risk_level: {
                type: Type.STRING,
                description: 'Must be one of: safe, caution, high_risk.',
              },
              primary_hazards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Top 2-4 terrain or operational hazards at this site.',
              },
              recommendation: {
                type: Type.STRING,
                description: 'Concise operational recommendation explaining why the site is safe, conditional, or unsafe.',
              },
              power_assessment: {
                type: Type.STRING,
                description: 'Assessment of solar illumination and power generation margin.',
              },
              communication_assessment: {
                type: Type.STRING,
                description: 'Assessment of direct-to-Earth visibility and communication relay needs.',
              },
              confidence: {
                type: Type.NUMBER,
                description: 'Model assessment confidence percentage from 0 to 100.',
              },
              limitations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Key data and modeling limitations for this assessment.',
              },
            },
            required: [
              'site_id',
              'safety_score',
              'risk_level',
              'primary_hazards',
              'recommendation',
              'power_assessment',
              'communication_assessment',
              'confidence',
              'limitations',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      return parsed;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', geminiConfigured: Boolean(ai) });
  });

  app.post('/api/briefing', async (req, res) => {
    try {
      const body = req.body as BriefingRequestBody;
      if (!body || !body.site || !body.site.id) {
        res.status(400).json({ error: 'Missing required site telemetry payload.' });
        return;
      }

      const briefing = await generateBriefingWithRetry(body);
      res.json(briefing);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI mission briefing.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lunar Landing Site Navigator server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
