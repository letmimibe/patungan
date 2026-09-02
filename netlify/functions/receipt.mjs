export const handler = async (req) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error:
          "GEMINI_API_KEY belum diset di Netlify Environment Variables."
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const image = body.image;
    const mimeType = body.mimeType || "image/jpeg";

    if (!image) {
      return Response.json(
        { error: "Image tidak ditemukan." },
        { status: 400 }
      );
    }

    /*
      Gemini REST API.
      Model sengaja disimpan sebagai environment variable
      supaya nanti gampang diganti.
    */

    const model =
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash";

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `
Kamu adalah AI untuk aplikasi split bill restoran bernama Patungan.

Baca foto struk yang diberikan.

Ekstrak HANYA informasi yang terlihat atau dapat disimpulkan
dengan kuat dari struk.

Balikkan JSON valid saja.

Format:

{
  "merchant": "nama restoran jika terlihat",
  "items": [
    {
      "name": "nama item",
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

Aturan:

1. Semua harga harus berupa angka integer tanpa simbol mata uang.
2. Jangan memasukkan item yang tidak terlihat.
3. Jika quantity lebih dari 1, isi quantity dengan jumlahnya.
4. Jika harga unit dan total sama-sama terlihat, isi keduanya.
5. Jika hanya total item yang terlihat, gunakan total sebagai "total".
6. Jangan membuat-buat harga.
7. Jangan memasukkan nomor meja, nomor transaksi,
   nomor telepon, atau metadata sebagai item.
8. Abaikan metode pembayaran.
9. Jangan memasukkan total pembayaran sebagai item.
10. Jika subtotal/tax/service/discount tidak terlihat,
    gunakan 0.
11. grand_total harus merupakan total akhir pada struk
    jika terlihat.
12. Output HARUS JSON valid tanpa markdown.
`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                inlineData: {
                  mimeType,
                  data: image
                }
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    const result = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini error:", result);

      return Response.json(
        {
          error:
            result?.error?.message ||
            "Gemini gagal memproses gambar."
        },
        { status: 502 }
      );
    }

    const text =
      result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return Response.json(
        {
          error:
            "Gemini tidak mengembalikan hasil."
        },
        { status: 502 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error("Invalid Gemini JSON:", text);

      return Response.json(
        {
          error:
            "Hasil AI bukan JSON yang valid."
        },
        { status: 502 }
      );
    }

    const normalized = {
      merchant:
        typeof parsed.merchant === "string"
          ? parsed.merchant
          : "",

      items:
        Array.isArray(parsed.items)
          ? parsed.items
              .map(item => ({
                name:
                  String(item.name || "Item").trim(),

                quantity:
                  Number(item.quantity) || 1,

                unit_price:
                  Number(item.unit_price) || 0,

                total:
                  Number(
                    item.total ??
                    item.price ??
                    item.unit_price ??
                    0
                  )
              }))
              .filter(item => item.total >= 0)
          : [],

      subtotal:
        Number(parsed.subtotal) || 0,

      tax:
        Number(parsed.tax) || 0,

      service_charge:
        Number(parsed.service_charge) || 0,

      discount:
        Number(parsed.discount) || 0,

      grand_total:
        Number(parsed.grand_total) || 0
    };

    return Response.json(normalized);

  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error:
          "Terjadi kesalahan saat memproses struk."
      },
      { status: 500 }
    );
  }
};