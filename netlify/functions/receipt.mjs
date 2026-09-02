export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const { image, mimeType } = JSON.parse(event.body || "{}");

    if (!image || !mimeType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Image is required" }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "GEMINI_API_KEY belum tersedia" }),
      };
    }

    const prompt = `
Read this restaurant receipt and return ONLY valid JSON.

Use this exact structure:

{
  "merchant": "",
  "items": [
    {
      "name": "",
      "quantity": 1,
      "unit_price": 0,
      "total": 0
    }
  ],
  "subtotal": 0,
  "tax": 0,
  "service_charge": 0,
  "discount": 0,
  "grand_total": 0
}

Rules:
- Read the receipt carefully.
- Use numbers only for prices.
- If a value is not visible, use 0.
- Do not add explanations.
`;

    // Menggunakan model gemini-1.5-flash
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        apiKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: data.error?.message || "Gemini API error",
        }),
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Gemini tidak mengembalikan data",
        }),
      };
    }

    const result = JSON.parse(text);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message || "Terjadi error",
      }),
    };
  }
};