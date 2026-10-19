/**
 * An amount for a reply: spoken in words on voice ("Fifty Dollars and Twenty Five Cents", "Cincuenta dólares…"), written
 * as '$1,500.00' on text. amountToSpeech; pure, part of jsfe/helpers.
 */
export function amountToSpeech(amount, language = 'en', voice = true) {

   try {
      if (!voice) {
         // Written: '$1,500.00' (it was the bare number, '1500.00', in every text reply).
         const n = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^-0-9.]/g, ''));
         return isNaN(n) ? String(amount) : (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      if (!language) {
         language = 'en';
      }

      if (language === 'en') {
         const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
         const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
         const scales = ["", "Thousand", "Million", "Billion"];

         function convertSmallNumber(num) {
            let words = "";
            if (num >= 100) {
               words += units[Math.floor(num / 100)] + " Hundred ";
               num %= 100;
            }
            if (num >= 20) {
               words += tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + units[num % 10] : "") + " ";
            } else if (num > 0) {
               words += units[num] + " ";
            }
            return words;
         }

         // 0. Validate and normalize input
         if (typeof amount === 'string') {
            amount = amount.replace(/[^-0-9.]/g, ''); // Keep the minus sign!
         }

         const numAmount = parseFloat(amount);

         if (isNaN(numAmount)) {
            return "Invalid amount";
         }

         if (Math.abs(numAmount) >= 1000000000000) {
            return "Amount exceeds 999 Billion limit";
         }

         // 1. Handle "Negative" prefix and work with absolute value
         const isNegative = numAmount < 0;
         let absoluteAmount = Math.abs(numAmount);

         // 2. Split Dollars and Cents
         const parts = absoluteAmount.toFixed(2).split(".");
         let dollarVal = parseInt(parts[0]);
         let centVal = parseInt(parts[1]);

         // 3. Process Dollars
         let dollarWords = "";
         if (dollarVal === 0) {
            dollarWords = "Zero";
         } else {
            let scaleIdx = 0;
            while (dollarVal > 0) {
               let chunk = dollarVal % 1000;
               if (chunk > 0) {
                  dollarWords = convertSmallNumber(chunk) + scales[scaleIdx] + " " + dollarWords;
               }
               dollarVal = Math.floor(dollarVal / 1000);
               scaleIdx++;
            }
         }

         // 4. Formatting for TTS
         const dLabel = (parseInt(parts[0]) === 1) ? "Dollar" : "Dollars";
         const cLabel = (centVal === 1) ? "Cent" : "Cents";

         let finalSpeech = (isNegative ? "Negative " : "") + dollarWords.trim() + " " + dLabel;

         if (centVal > 0) {
            const centWords = convertSmallNumber(centVal);
            finalSpeech += " and " + centWords.trim() + " " + cLabel;
         }

         return finalSpeech.replace(/\s+/g, ' ');
      } else if (language === 'es') {
         // Spanish implementation
         const basics = ["", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce", "Trece", "Catorce", "Quince", "Dieciséis", "Diecisiete", "Dieciocho", "Diecinueve", "Veinte", "Veintiún", "Veintidós", "Veintitrés", "Veinticuatro", "Veinticinco", "Veintiséis", "Veintisiete", "Veintiocho", "Veintinueve"];
         const tens = ["", "", "Veinte", "Treinta", "Cuarenta", "Cincuenta", "Sesenta", "Setenta", "Ochenta", "Noventa"];
         const hundreds = ["", "Ciento", "Doscientos", "Trescientos", "Cuatrocientos", "Quinientos", "Seiscientos", "Setecientos", "Ochocientos", "Novecientos"];

         function convertGroup(n) {
            let output = "";
            if (n === 100) return "Cien";

            if (n >= 100) {
               output += hundreds[Math.floor(n / 100)] + " ";
               n %= 100;
            }

            if (n === 0 && output.length > 0) return output.trim();
            if (n === 0) return "";

            if (n < 30) {
               output += basics[n];
            } else {
               output += tens[Math.floor(n / 10)];
               if ((n % 10) > 0) {
                  output += " y " + basics[n % 10];
               }
            }
            return output.trim();
         }

         if (typeof amount === 'string') {
            amount = amount.replace(/[^-0-9.]/g, '');
         }

         const numAmount = parseFloat(amount);

         if (isNaN(numAmount)) {
            return "Cantidad no válida";
         }

         if (Math.abs(numAmount) >= 1000000000000) {
            return "Cantidad excede el límite de 999 billones";
         }

         const isNegative = numAmount < 0;
         let absoluteAmount = Math.abs(numAmount);

         const parts = absoluteAmount.toFixed(2).split(".");
         let dollarVal = parseInt(parts[0]);
         let centVal = parseInt(parts[1]);

         let dollarWords = "";
         if (dollarVal === 0) {
            dollarWords = "Cero";
         } else if (dollarVal === 1) {
            dollarWords = "Un";
         } else {
            let scaleIdx = 0;
            let tempDollars = dollarVal;
            let accumulated = "";

            while (tempDollars > 0) {
               let chunk = tempDollars % 1000;
               if (chunk > 0) {
                  let chunkText = convertGroup(chunk);

                  if (scaleIdx === 0) {
                     accumulated = chunkText + " " + accumulated;
                  } else if (scaleIdx === 1) {
                     // Thousands
                     if (chunk === 1) {
                        accumulated = "Mil " + accumulated;
                     } else {
                        accumulated = chunkText + " Mil " + accumulated;
                     }
                  } else if (scaleIdx === 2) {
                     // Millions
                     if (chunk === 1) {
                        accumulated = "Un Millón " + accumulated;
                     } else {
                        accumulated = chunkText + " Millones " + accumulated;
                     }
                  } else if (scaleIdx === 3) {
                     // Billions
                     if (chunk === 1) {
                        accumulated = "Un Billón " + accumulated;
                     } else {
                        accumulated = chunkText + " Billones " + accumulated;
                     }
                  }
               }
               tempDollars = Math.floor(tempDollars / 1000);
               scaleIdx++;
            }
            dollarWords = accumulated.trim();
         }

         const dLabel = (parseInt(parts[0]) === 1) ? "Dólar" : "Dólares";
         const cLabel = (centVal === 1) ? "Centavo" : "Centavos";

         // Add "de" for exact millions/billions
         if (dollarWords.endsWith("Millón") || dollarWords.endsWith("Millones") || dollarWords.endsWith("Billón") || dollarWords.endsWith("Billones")) {
            dollarWords += " de";
         }

         let finalSpeech = (isNegative ? "Negativo " : "") + dollarWords + " " + dLabel;

         if (centVal > 0) {
            let centWords = "";
            if (centVal === 1) centWords = "Un";
            else centWords = convertGroup(centVal);
            finalSpeech += " con " + centWords + " " + cLabel;
         }

         return finalSpeech.replace(/\s+/g, ' ').trim();
      } else {
         return `Language ${language} not supported for amount to speech conversion`;
      }
   } catch (error) {
      return `Error converting amount to speech: ${error.message}`;
   }
}
