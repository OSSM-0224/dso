import type { AreaMessages } from "../types.ts";

export const fixtures: AreaMessages = {
  mr: {
    "Failed to update strong teams": "मजबूत संघ अद्ययावत करण्यात अयशस्वी",
    "Failed to generate fixtures": "सामने तयार करण्यात अयशस्वी",
    "Play-In Bracket Geometry Preview": "प्ले-इन ब्रॅकेट रचना पूर्वावलोकन",
    "Total Enrolled": "एकूण नोंदणीकृत",
    "Teams": "संघ",
    "Next Power-of-2": "पुढील २ ची घात",
    "Bracket Slots": "ब्रॅकेट स्लॉट",
    "Round 1 Byes": "फेरी १ बाय",
    "P - N Byes": "P - N बाय",
    "Round 1 Matches": "फेरी १ सामने",
    "N - P/2 Play-Ins": "N - P/2 प्ले-इन",
    "Round 2 Teams": "फेरी २ संघ",
    "P/2 Teams": "P/2 संघ",
    "Pick Strong Teams": "मजबूत संघ निवडा",
    "{count} selected": "{count} निवडले",
    "Organizer selects top contending teams (e.g. NHPS, MNR, BVPT). The engine seeds them into separate quarters so they only meet in the semifinals or final, and grants them byes after champions.":
      "आयोजक अव्वल स्पर्धक संघ निवडतो (उदा. NHPS, MNR, BVPT). इंजिन त्यांना वेगवेगळ्या क्वार्टरमध्ये बियाणे म्हणून ठेवते जेणेकरून ते केवळ उपांत्य किंवा अंतिम फेरीत भेटतील, आणि विजेत्यांनंतर त्यांना बाय देतो.",
    "Medium": "माध्यम",
    "Auto-Detected Recent Champions": "स्वयं-शोधित अलीकडील विजेते",
    "Lookback: {years} Years": "मागे पाहणी: {years} वर्षे",
    "Rule 1 & 2: System scans the database for winners of completed {sport} {ageGroup} {gender} tournaments in the past {years} years ({from}–{to}). These teams receive highest priority for Round 1 byes!":
      "नियम १ आणि २: प्रणाली गेल्या {years} वर्षांतील ({from}–{to}) पूर्ण झालेल्या {sport} {ageGroup} {gender} स्पर्धांच्या विजेत्यांसाठी डेटाबेस स्कॅन करते. या संघांना फेरी १ च्या बायसाठी सर्वोच्च प्राधान्य मिळते!",
    "No past champions detected for {sport} {ageGroup} {gender} within {years} years.":
      "{years} वर्षांमध्ये {sport} {ageGroup} {gender} साठी पूर्वीचे विजेते आढळले नाहीत.",
    "(You can record past tournament results in the Past Champions tab)":
      "(तुम्ही \"माजी विजेते\" टॅबमध्ये पूर्वीच्या स्पर्धांचे निकाल नोंदवू शकता)",
    "Applied Engine Rules & Priority Hierarchy": "लागू केलेले इंजिन नियम आणि प्राधान्य क्रम",
    "Same School Separation:": "एकाच शाळेचे विभाजन:",
    "Teams from the same school with different mediums (Marathi vs English) will never face each other in Round 1 (Hard Constraint).":
      "एकाच शाळेतील वेगवेगळ्या माध्यमांचे संघ (मराठी वि. इंग्रजी) फेरी १ मध्ये कधीही एकमेकांसमोर येणार नाहीत (कठोर बंधन).",
    "Strong Teams Quarters:": "मजबूत संघ क्वार्टर:",
    "Placed via standard bracket seeding across different quarters. They cannot meet until the semifinals or final.":
      "वेगवेगळ्या क्वार्टरमध्ये मानक ब्रॅकेट बियाण्यांद्वारे ठेवले जातात. ते उपांत्य किंवा अंतिम फेरीपर्यंत भेटू शकत नाहीत.",
    "Champions Round 1 Bye:": "विजेत्यांना फेरी १ बाय:",
    "Auto-detected recent champions receive priority 1 for first-round byes and skip Round 1.":
      "स्वयं-शोधित अलीकडील विजेत्यांना पहिल्या फेरीच्या बायसाठी प्राधान्य १ मिळते आणि ते फेरी १ वगळतात.",
    "Quarter Bye Balance:": "क्वार्टर बाय संतुलन:",
    "Byes are evenly distributed across all 4 quarters (no two quarters differ by more than 1 bye).":
      "सर्व ४ क्वार्टरमध्ये बाय समान रीतीने वाटल्या जातात (कोणत्याही दोन क्वार्टरमध्ये १ पेक्षा जास्त बायचा फरक नसतो).",
    "Play-In Progression:": "प्ले-इन प्रगती:",
    "All rounds (R1 to Final) are generated up front with auto-advancing nextMatch linkages.":
      "सर्व फेऱ्या (फेरी १ ते अंतिम) आगाऊ तयार केल्या जातात आणि पुढील सामन्याच्या दुव्यांसह स्वयंचलित प्रगती होते.",
    "Deterministic Reproducibility:": "निश्चित पुनरुत्पादनक्षमता:",
    "Remaining teams are shuffled using a seeded PRNG for exact audit reproducibility.":
      "उर्वरित संघ अचूक लेखापरीक्षण पुनरुत्पादनासाठी बियाणे-आधारित PRNG वापरून शफल केले जातात.",
    "Fixture Generation Blocked:": "सामना निर्मिती अवरोधित:",
    "Team enrollment is currently open. You must lock enrollment before generating the tournament draw.":
      "संघ नोंदणी सध्या सुरू आहे. स्पर्धेचा ड्रॉ तयार करण्यापूर्वी तुम्ही नोंदणी लॉक करणे आवश्यक आहे.",
    "(Go to \"Enrolled Teams\" tab to lock)": "(\"नोंदणीकृत संघ\" टॅबमध्ये जाऊन लॉक करा)",
    "Optional Random Seed:": "ऐच्छिक रँडम सीड:",
    "Auto-random": "स्वयं-रँडम",
    "Lock enrollment first to generate fixtures": "सामने तयार करण्यासाठी आधी नोंदणी लॉक करा",
    "Generating Fixtures...": "सामने तयार करत आहे...",
    "🔒 Lock Enrollment to Generate": "🔒 तयार करण्यासाठी नोंदणी लॉक करा",
    "At least 4 teams required": "किमान ४ संघ आवश्यक",
    "Generate Kho-Kho Fixture": "खो-खो सामना तयार करा",
    "Selected 1st team: \"{name}\". Now click another team to swap.":
      "पहिला संघ निवडला: \"{name}\". आता बदली करण्यासाठी दुसरा संघ क्लिक करा.",
    "Successfully swapped \"{teamA}\" and \"{teamB}\".":
      "\"{teamA}\" आणि \"{teamB}\" यशस्वीरित्या बदलले.",
    "Failed to swap teams": "संघ बदलण्यात अयशस्वी",
    "Regenerated fixtures with fresh random seed.": "नवीन रँडम सीडसह सामने पुन्हा तयार केले.",
    "Failed to regenerate": "पुन्हा तयार करण्यात अयशस्वी",
    "Are you sure you want to lock and publish these fixtures? Once published, matches become official and open for public viewing.":
      "तुम्हाला हे सामने लॉक करून प्रकाशित करायचे आहेत का? प्रकाशित झाल्यावर सामने अधिकृत होतील आणि सार्वजनिक पाहण्यासाठी खुले होतील.",
    "Tournament fixtures locked and published successfully!":
      "स्पर्धेचे सामने यशस्वीरित्या लॉक आणि प्रकाशित झाले!",
    "Failed to publish fixtures": "सामने प्रकाशित करण्यात अयशस्वी",
    "Dismiss message": "संदेश बंद करा",
    "Fixture Snapshot & Generation Audit": "सामना स्नॅपशॉट आणि निर्मिती ऑडिट",
    "Random Seed:": "रँडम सीड:",
    "Byes Awarded:": "दिलेल्या बाय:",
    "Generated by {name}": "{name} द्वारे तयार केले",
    "Regenerating...": "पुन्हा तयार करत आहे...",
    "Regenerate Draw": "ड्रॉ पुन्हा तयार करा",
    "Publishing...": "प्रकाशित करत आहे...",
    "Lock & Publish": "लॉक आणि प्रकाशित करा",
    "Applied Engine Constraint Warnings:": "लागू इंजिन बंधन इशारे:",
    "Manual Swap:": "मॅन्युअल बदली:",
    "1st team selected: \"{name}\". Click another team in Round 1 to swap.":
      "पहिला संघ निवडला: \"{name}\". बदली करण्यासाठी फेरी १ मधील दुसरा संघ क्लिक करा.",
    "Click any team in Round 1 to select for swap. The engine verifies all rules instantly.":
      "बदलीसाठी निवडण्यासाठी फेरी १ मधील कोणताही संघ क्लिक करा. इंजिन सर्व नियम त्वरित तपासते.",
    "Cancel selection": "निवड रद्द करा",
    "Rule Violation Confirmation": "नियम भंग पुष्टीकरण",
    "Swapping {teamA} and {teamB} breaks the following fixture rules:":
      "{teamA} आणि {teamB} ची अदलाबदल केल्यास खालील सामना नियम मोडले जातील:",
    "Do you wish to override and apply this manual swap anyway? This action will be recorded in the tournament audit log.":
      "तुम्हाला तरीही ही मॅन्युअल बदली ओव्हरराइड करून लागू करायची आहे का? ही क्रिया स्पर्धा ऑडिट लॉगमध्ये नोंदवली जाईल.",
    "Cancel Swap": "बदली रद्द करा",
    "Applying...": "लागू करत आहे...",
    "Confirm Override & Swap": "ओव्हरराइड आणि बदलीची पुष्टी करा",
  },
  hi: {
    "Failed to update strong teams": "मजबूत टीमें अपडेट करने में विफल",
    "Failed to generate fixtures": "फ़िक्स्चर बनाने में विफल",
    "Play-In Bracket Geometry Preview": "प्ले-इन ब्रैकेट संरचना पूर्वावलोकन",
    "Total Enrolled": "कुल पंजीकृत",
    "Teams": "टीमें",
    "Next Power-of-2": "अगली 2 की घात",
    "Bracket Slots": "ब्रैकेट स्लॉट",
    "Round 1 Byes": "राउंड 1 बाय",
    "P - N Byes": "P - N बाय",
    "Round 1 Matches": "राउंड 1 मुकाबले",
    "N - P/2 Play-Ins": "N - P/2 प्ले-इन",
    "Round 2 Teams": "राउंड 2 टीमें",
    "P/2 Teams": "P/2 टीमें",
    "Pick Strong Teams": "मजबूत टीमें चुनें",
    "{count} selected": "{count} चयनित",
    "Organizer selects top contending teams (e.g. NHPS, MNR, BVPT). The engine seeds them into separate quarters so they only meet in the semifinals or final, and grants them byes after champions.":
      "आयोजक शीर्ष प्रतिस्पर्धी टीमों का चयन करता है (उदा. NHPS, MNR, BVPT)। इंजिन उन्हें अलग-अलग क्वार्टर में सीड करता है ताकि वे केवल सेमीफ़ाइनल या फ़ाइनल में मिलें, और चैंपियन के बाद उन्हें बाय देता है।",
    "Medium": "माध्यम",
    "Auto-Detected Recent Champions": "स्वतः-पहचाने गए हालिया चैंपियन",
    "Lookback: {years} Years": "पीछे देखें: {years} वर्ष",
    "Rule 1 & 2: System scans the database for winners of completed {sport} {ageGroup} {gender} tournaments in the past {years} years ({from}–{to}). These teams receive highest priority for Round 1 byes!":
      "नियम 1 और 2: सिस्टम पिछले {years} वर्षों ({from}–{to}) में पूर्ण हुए {sport} {ageGroup} {gender} टूर्नामेंट के विजेताओं के लिए डेटाबेस स्कैन करता है। इन टीमों को राउंड 1 बाय के लिए सर्वोच्च प्राथमिकता मिलती है!",
    "No past champions detected for {sport} {ageGroup} {gender} within {years} years.":
      "{years} वर्षों में {sport} {ageGroup} {gender} के लिए कोई पिछला चैंपियन नहीं मिला।",
    "(You can record past tournament results in the Past Champions tab)":
      "(आप \"पिछले चैंपियन\" टैब में पिछले टूर्नामेंट के परिणाम दर्ज कर सकते हैं)",
    "Applied Engine Rules & Priority Hierarchy": "लागू इंजिन नियम और प्राथमिकता क्रम",
    "Same School Separation:": "एक ही स्कूल का पृथक्करण:",
    "Teams from the same school with different mediums (Marathi vs English) will never face each other in Round 1 (Hard Constraint).":
      "एक ही स्कूल की अलग-अलग माध्यम वाली टीमें (मराठी बनाम अंग्रेज़ी) राउंड 1 में कभी आमने-सामने नहीं आएंगी (कठोर बाध्यता)।",
    "Strong Teams Quarters:": "मजबूत टीम क्वार्टर:",
    "Placed via standard bracket seeding across different quarters. They cannot meet until the semifinals or final.":
      "मानक ब्रैकेट सीडिंग के माध्यम से अलग-अलग क्वार्टर में रखा जाता है। वे सेमीफ़ाइनल या फ़ाइनल तक नहीं मिल सकते।",
    "Champions Round 1 Bye:": "चैंपियन राउंड 1 बाय:",
    "Auto-detected recent champions receive priority 1 for first-round byes and skip Round 1.":
      "स्वतः-पहचाने गए हालिया चैंपियन को पहले राउंड के बाय के लिए प्राथमिकता 1 मिलती है और वे राउंड 1 छोड़ देते हैं।",
    "Quarter Bye Balance:": "क्वार्टर बाय संतुलन:",
    "Byes are evenly distributed across all 4 quarters (no two quarters differ by more than 1 bye).":
      "बाय सभी 4 क्वार्टर में समान रूप से वितरित किए जाते हैं (किसी भी दो क्वार्टर में 1 से अधिक बाय का अंतर नहीं होता)।",
    "Play-In Progression:": "प्ले-इन प्रगति:",
    "All rounds (R1 to Final) are generated up front with auto-advancing nextMatch linkages.":
      "सभी राउंड (R1 से फ़ाइनल) पहले से बनाए जाते हैं, जिनमें अगले मुकाबले के लिंक स्वतः आगे बढ़ते हैं।",
    "Deterministic Reproducibility:": "निर्धारित पुनरुत्पादनक्षमता:",
    "Remaining teams are shuffled using a seeded PRNG for exact audit reproducibility.":
      "शेष टीमें सटीक ऑडिट पुनरुत्पादन के लिए सीड-आधारित PRNG का उपयोग करके शफ़ल की जाती हैं।",
    "Fixture Generation Blocked:": "फ़िक्स्चर निर्माण अवरुद्ध:",
    "Team enrollment is currently open. You must lock enrollment before generating the tournament draw.":
      "टीम पंजीकरण अभी खुला है। टूर्नामेंट ड्रा बनाने से पहले आपको पंजीकरण लॉक करना होगा।",
    "(Go to \"Enrolled Teams\" tab to lock)": "(\"पंजीकृत टीमें\" टैब में जाकर लॉक करें)",
    "Optional Random Seed:": "वैकल्पिक रैंडम सीड:",
    "Auto-random": "स्वतः-रैंडम",
    "Lock enrollment first to generate fixtures": "फ़िक्स्चर बनाने के लिए पहले पंजीकरण लॉक करें",
    "Generating Fixtures...": "फ़िक्स्चर बनाए जा रहे हैं...",
    "🔒 Lock Enrollment to Generate": "🔒 बनाने के लिए पंजीकरण लॉक करें",
    "At least 4 teams required": "कम से कम 4 टीमें आवश्यक",
    "Generate Kho-Kho Fixture": "खो-खो फ़िक्स्चर बनाएं",
    "Selected 1st team: \"{name}\". Now click another team to swap.":
      "पहली टीम चयनित: \"{name}\". अब बदली के लिए दूसरी टीम पर क्लिक करें।",
    "Successfully swapped \"{teamA}\" and \"{teamB}\".":
      "\"{teamA}\" और \"{teamB}\" सफलतापूर्वक बदली गईं।",
    "Failed to swap teams": "टीमें बदलने में विफल",
    "Regenerated fixtures with fresh random seed.": "नए रैंडम सीड के साथ फ़िक्स्चर पुनः बनाए गए।",
    "Failed to regenerate": "पुनः बनाने में विफल",
    "Are you sure you want to lock and publish these fixtures? Once published, matches become official and open for public viewing.":
      "क्या आप वाकई इन फ़िक्स्चर को लॉक और प्रकाशित करना चाहते हैं? प्रकाशित होने के बाद मुकाबले आधिकारिक हो जाएंगे और जनता के देखने के लिए खुल जाएंगे।",
    "Tournament fixtures locked and published successfully!":
      "टूर्नामेंट फ़िक्स्चर सफलतापूर्वक लॉक और प्रकाशित हो गए!",
    "Failed to publish fixtures": "फ़िक्स्चर प्रकाशित करने में विफल",
    "Dismiss message": "संदेश बंद करें",
    "Fixture Snapshot & Generation Audit": "फ़िक्स्चर स्नैपशॉट और निर्माण ऑडिट",
    "Random Seed:": "रैंडम सीड:",
    "Byes Awarded:": "दिए गए बाय:",
    "Generated by {name}": "{name} द्वारा बनाया गया",
    "Regenerating...": "पुनः बनाया जा रहा है...",
    "Regenerate Draw": "ड्रा पुनः बनाएं",
    "Publishing...": "प्रकाशित किया जा रहा है...",
    "Lock & Publish": "लॉक और प्रकाशित करें",
    "Applied Engine Constraint Warnings:": "लागू इंजिन बाध्यता चेतावनियाँ:",
    "Manual Swap:": "मैन्युअल बदली:",
    "1st team selected: \"{name}\". Click another team in Round 1 to swap.":
      "पहली टीम चयनित: \"{name}\". बदली के लिए राउंड 1 में दूसरी टीम पर क्लिक करें।",
    "Click any team in Round 1 to select for swap. The engine verifies all rules instantly.":
      "बदली के लिए चुनने हेतु राउंड 1 में किसी भी टीम पर क्लिक करें। इंजिन सभी नियम तुरंत सत्यापित करता है।",
    "Cancel selection": "चयन रद्द करें",
    "Rule Violation Confirmation": "नियम उल्लंघन पुष्टि",
    "Swapping {teamA} and {teamB} breaks the following fixture rules:":
      "{teamA} और {teamB} की अदला-बदली करने से निम्नलिखित फ़िक्स्चर नियम टूटते हैं:",
    "Do you wish to override and apply this manual swap anyway? This action will be recorded in the tournament audit log.":
      "क्या आप फिर भी इस मैन्युअल बदली को ओवरराइड करके लागू करना चाहते हैं? यह क्रिया टूर्नामेंट ऑडिट लॉग में दर्ज की जाएगी।",
    "Cancel Swap": "बदली रद्द करें",
    "Applying...": "लागू किया जा रहा है...",
    "Confirm Override & Swap": "ओवरराइड और बदली की पुष्टि करें",
  },
};
