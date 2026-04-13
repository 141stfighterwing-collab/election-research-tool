import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import jsonrepair from "jsonrepair";
import type {
  ResearchResult,
  SearchRequest,
  DonationRecord,
  BusinessRecord,
  EmploymentRecord,
  ContactInfo,
} from "@/lib/types";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function sanitizeName(raw: string): string {
  return raw
    .replace(/[\t\r]/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildResearchQueries(
  name: string,
  city?: string,
  state?: string
): string[] {
  const location = [city, state].filter(Boolean).join(", ");
  const locSuffix = location ? ` ${location}` : "";

  return [
    `"${name}"${locSuffix} FEC campaign donations political contributions`,
    `"${name}"${locSuffix} ORESTAR Oregon donations political`,
    `"${name}"${locSuffix} business LLC corporation Secretary of State filing`,
    `"${name}"${locSuffix} LinkedIn employer occupation professional`,
    `"${name}"${locSuffix} address phone email contact`,
  ];
}

function buildExtractionPrompt(
  name: string,
  searchResults: string,
  city?: string,
  state?: string
): string {
  const location = [city, state].filter(Boolean).join(", ");

  return `You are an OSINT research analyst extracting public records information about a person. Your task is to extract structured data ONLY from the web search results provided below.

TARGET PERSON: ${name}${location ? ` (Location context: ${location})` : ""}

WEB SEARCH RESULTS:
${searchResults}

CRITICAL RULES - FOLLOW STRICTLY:
1. ONLY include information that is explicitly found in the search results above.
2. If a field cannot be determined from the search results, use empty string "" for strings, empty array [] for arrays, and false for booleans.
3. NEVER fabricate, guess, or infer data that is not in the search results.
4. Cap donations array at 10 items maximum.
5. Cap business records at 5 items maximum.
6. Cap employment records at 5 items maximum.
7. For donation amounts, preserve the exact format found (e.g., "$2,500" or "2500.00").
8. Assign a confidence score (0-100) based on how well the search results match the target person. Consider name match, location match, and specificity of results.
9. Include ALL source URLs found in the search results.
10. Check for potential duplicate entries (different people with the same name).

Return ONLY valid JSON matching this exact structure, no markdown or explanation:
{
  "confidence": <number 0-100>,
  "summary": "<brief summary of findings, or 'No matching public records found.' if nothing found>",
  "isDuplicate": false,
  "duplicateWarning": "",
  "politicalActivity": {
    "hasFECRecord": false,
    "totalDonations": "",
    "donations": [],
    "officesSought": [],
    "partyAffiliation": ""
  },
  "businessRecords": [],
  "professionalHistory": [],
  "contactInfo": {
    "phone": [],
    "email": [],
    "address": [],
    "linkedin": "",
    "twitter": "",
    "otherSocial": []
  },
  "sources": []
}

Donation records should follow this format: {"date": "", "amount": "", "recipient": "", "type": ""}
Business records: {"name": "", "type": "", "state": "", "status": "", "role": ""}
Employment records: {"employer": "", "title": "", "period": "", "isCurrent": false}`;
}

async function researchPerson(
  zai: InstanceType<typeof ZAI>,
  name: string,
  city?: string,
  state?: string,
  retries = 3
): Promise<ResearchResult> {
  const queries = buildResearchQueries(name, city, state);
  const allSearchResults: string[] = [];
  const allSources: string[] = [];

  // Perform web searches
  for (const query of queries) {
    try {
      const results = await zai.functions.invoke("web_search", {
        query,
        num: 5,
      });
      if (Array.isArray(results) && results.length > 0) {
        for (const r of results) {
          allSearchResults.push(
            `[${r.name || "Untitled"}] (${r.url})\n${r.snippet || "No snippet available"}`
          );
          if (r.url) allSources.push(r.url);
        }
      }
    } catch {
      // Continue with other queries if one fails
    }
    await sleep(500);
  }

  if (allSearchResults.length === 0) {
    return {
      id: generateId(),
      name,
      targetCity: city,
      targetState: state,
      confidence: 0,
      status: "pending",
      isDuplicate: false,
      politicalActivity: {
        hasFECRecord: false,
        totalDonations: "",
        donations: [],
        officesSought: [],
        partyAffiliation: "",
      },
      businessRecords: [],
      professionalHistory: [],
      contactInfo: {
        phone: [],
        email: [],
        address: [],
        linkedin: "",
        twitter: "",
        otherSocial: [],
      },
      summary: "No search results found for this individual.",
      sources: [],
      searchedAt: new Date().toISOString(),
    };
  }

  // Use AI to extract structured data from search results
  const prompt = buildExtractionPrompt(
    name,
    allSearchResults.join("\n\n---\n\n"),
    city,
    state
  );

  try {
    const response = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a precise data extraction assistant. Return ONLY valid JSON. No markdown formatting, no code blocks, no explanation. Just raw JSON.",
        },
        { role: "user", content: prompt },
      ],
    });

    let content = "";
    if (typeof response === "object" && response !== null) {
      if ("choices" in response && Array.isArray(response.choices) && response.choices.length > 0) {
        content =
          typeof response.choices[0].message?.content === "string"
            ? response.choices[0].message.content
            : "";
      } else if ("content" in response && typeof response.content === "string") {
        content = response.content;
      } else if ("message" in response) {
        const msg = response.message as any;
        content = typeof msg?.content === "string" ? msg.content : "";
      }
    }

    // Clean the response and attempt JSON parse
    let cleaned = content.trim();
    // Remove markdown code blocks if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try jsonrepair
      try {
        parsed = JSON.parse(jsonrepair(cleaned));
      } catch (repairError) {
        throw new Error(`Failed to parse AI response: ${repairError}`);
      }
    }

    // Build the result
    const donations: DonationRecord[] = Array.isArray(parsed.politicalActivity?.donations)
      ? parsed.politicalActivity.donations.slice(0, 10).map((d: any) => ({
          date: String(d.date || ""),
          amount: String(d.amount || ""),
          recipient: String(d.recipient || ""),
          type: String(d.type || ""),
        }))
      : [];

    const businessRecords: BusinessRecord[] = Array.isArray(parsed.businessRecords)
      ? parsed.businessRecords.slice(0, 5).map((b: any) => ({
          name: String(b.name || ""),
          type: String(b.type || ""),
          state: String(b.state || ""),
          status: String(b.status || ""),
          role: String(b.role || ""),
        }))
      : [];

    const employment: EmploymentRecord[] = Array.isArray(parsed.professionalHistory)
      ? parsed.professionalHistory.slice(0, 5).map((e: any) => ({
          employer: String(e.employer || ""),
          title: String(e.title || ""),
          period: String(e.period || ""),
          isCurrent: Boolean(e.isCurrent),
        }))
      : [];

    const ci = parsed.contactInfo || {};
    const contactInfo: ContactInfo = {
      phone: Array.isArray(ci.phone) ? ci.phone.map(String) : [],
      email: Array.isArray(ci.email) ? ci.email.map(String) : [],
      address: Array.isArray(ci.address) ? ci.address.map(String) : [],
      linkedin: String(ci.linkedin || ""),
      twitter: String(ci.twitter || ""),
      otherSocial: Array.isArray(ci.otherSocial) ? ci.otherSocial.map(String) : [],
    };

    const sources = Array.isArray(parsed.sources)
      ? [...new Set([...parsed.sources.map(String), ...allSources])]
      : [...new Set(allSources)];

    return {
      id: generateId(),
      name,
      targetCity: city,
      targetState: state,
      confidence: typeof parsed.confidence === "number" ? Math.min(100, Math.max(0, Math.round(parsed.confidence))) : 50,
      status: "pending",
      isDuplicate: Boolean(parsed.isDuplicate),
      duplicateWarning: String(parsed.duplicateWarning || ""),
      politicalActivity: {
        hasFECRecord: Boolean(parsed.politicalActivity?.hasFECRecord),
        totalDonations: String(parsed.politicalActivity?.totalDonations || ""),
        donations,
        officesSought: Array.isArray(parsed.politicalActivity?.officesSought)
          ? parsed.politicalActivity.officesSought.map(String)
          : [],
        partyAffiliation: String(parsed.politicalActivity?.partyAffiliation || ""),
      },
      businessRecords,
      professionalHistory: employment,
      contactInfo,
      summary: String(parsed.summary || "Research completed."),
      sources,
      searchedAt: new Date().toISOString(),
    };
  } catch (error) {
    // If extraction fails, retry with exponential backoff
    if (retries > 0) {
      await sleep(2000 * (4 - retries) + Math.random() * 1000);
      return researchPerson(zai, name, city, state, retries - 1);
    }

    return {
      id: generateId(),
      name,
      targetCity: city,
      targetState: state,
      confidence: 0,
      status: "pending",
      isDuplicate: false,
      politicalActivity: {
        hasFECRecord: false,
        totalDonations: "",
        donations: [],
        officesSought: [],
        partyAffiliation: "",
      },
      businessRecords: [],
      professionalHistory: [],
      contactInfo: {
        phone: [],
        email: [],
        address: [],
        linkedin: "",
        twitter: "",
        otherSocial: [],
      },
      summary: "Research failed due to an error processing results.",
      sources: allSources,
      searchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { names, targetCity, targetState } = body;

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json(
        { error: "At least one name is required." },
        { status: 400 }
      );
    }

    if (names.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 names per request." },
        { status: 400 }
      );
    }

    // Sanitize names
    const sanitizedNames = names
      .map(sanitizeName)
      .filter((n) => n.length > 0);

    if (sanitizedNames.length === 0) {
      return NextResponse.json(
        { error: "No valid names found after sanitization." },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();
    const results: ResearchResult[] = [];
    const total = sanitizedNames.length;

    for (let i = 0; i < sanitizedNames.length; i++) {
      const name = sanitizedNames[i];
      try {
        const result = await researchPerson(zai, name, targetCity, targetState);
        results.push(result);
      } catch (err) {
        results.push({
          id: generateId(),
          name,
          targetCity,
          targetState,
          confidence: 0,
          status: "pending",
          isDuplicate: false,
          politicalActivity: {
            hasFECRecord: false,
            totalDonations: "",
            donations: [],
            officesSought: [],
            partyAffiliation: "",
          },
          businessRecords: [],
          professionalHistory: [],
          contactInfo: {
            phone: [],
            email: [],
            address: [],
            linkedin: "",
            twitter: "",
            otherSocial: [],
          },
          summary: "An unexpected error occurred during research.",
          sources: [],
          searchedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      // Rate limiting: wait between requests
      if (i < sanitizedNames.length - 1) {
        await sleep(1000 + Math.random() * 500);
      }
    }

    // Check for duplicates among results
    const nameMap = new Map<string, ResearchResult[]>();
    for (const result of results) {
      const key = result.name.toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, []);
      }
      nameMap.get(key)!.push(result);
    }
    for (const [, entries] of nameMap) {
      if (entries.length > 1) {
        for (let i = 1; i < entries.length; i++) {
          entries[i].isDuplicate = true;
          entries[i].duplicateWarning = `Potential duplicate of ${entries[0].name}`;
        }
      }
    }

    return NextResponse.json({
      results,
      total,
      processed: results.length,
    });
  } catch (error) {
    console.error("Research API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
