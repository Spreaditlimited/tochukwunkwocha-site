const { renderBrandedEmail, stripHtml } = require("../../netlify/functions/_lib/branded-email");

const BASE_URL = "https://tochukwunkwocha.com";

const links = {
  courses: `${BASE_URL}/courses/`,
  promptToProfit: `${BASE_URL}/courses/prompt-to-profit/`,
  promptToProduction: `${BASE_URL}/courses/prompt-to-production/`,
  everydayBusiness: `${BASE_URL}/courses/ai-for-everyday-business-owners/`,
  schools: `${BASE_URL}/courses/prompt-to-profit-schools/`,
  kids: `${BASE_URL}/courses/prompt-to-profit-children/`,
  businessAi: `${BASE_URL}/blog/ai-for-nigerian-small-business-owners-practical-daily-use-cases/`,
  businessWebsite: `${BASE_URL}/blog/how-nigerian-small-businesses-can-build-a-website-with-ai/`,
  studentWebsites: `${BASE_URL}/blog/how-nigerian-students-can-build-websites-with-chatgpt-without-coding/`,
  promptEngineering: `${BASE_URL}/blog/prompt-engineering-for-nigerian-students/`,
  curriculum: `${BASE_URL}/blog/ai-curriculum-for-nigerian-schools-what-students-should-actually-learn/`,
};

function lessonHtml(title, body) {
  return renderBrandedEmail({
    title,
    subject: title,
    eyebrow: "Practical AI Building Lessons",
    bodyHtml: body,
  });
}

const lessons = [
  {
    number: 1,
    waitDaysAfterPrevious: 0,
    name: "Start with one real task",
    subject: "Lesson 1: Pick one AI task that can actually improve your work",
    previewText: "Do not start with tools. Start with one repeated task that wastes time or creates mistakes.",
    htmlContent: lessonHtml(
      "Pick one AI task that can actually improve your work",
      `
        <p style="margin:0 0 16px;">Most people approach AI backwards. They open ChatGPT, ask a few random questions, get a few impressive answers, and then wonder why nothing changes in their actual work.</p>
        <p style="margin:0 0 16px;">The better way is to begin with one repeated task. Not a vague goal like “use AI for my business.” A specific task you already do, understand, and can judge.</p>
        <p style="margin:0 0 16px;">Here is the exercise for this week. Open a note and write down ten tasks you repeated in the last seven days. Examples: replying customer questions, explaining your offer, creating lesson notes, writing product descriptions, planning content, preparing reports, summarizing meetings, checking student work, creating proposals, or organizing scattered ideas.</p>
        <p style="margin:0 0 16px;">Now score each task using three questions:</p>
        <ol style="margin:0 0 16px 22px;padding:0;">
          <li>Does this task happen often?</li>
          <li>Does it follow a pattern?</li>
          <li>Can I easily tell whether the output is good or bad?</li>
        </ol>
        <p style="margin:0 0 16px;">Choose the task with the strongest “yes” across those three questions. That is your first AI use case. You are not trying to automate your whole life. You are trying to build one reliable workflow.</p>
        <p style="margin:0 0 16px;">A good first AI task has boundaries. For example: “Help me turn a rough customer complaint into a calm professional reply” is better than “manage my customer service.” “Turn these bullet points into a lesson outline for JSS students” is better than “help me teach.”</p>
        <p style="margin:0 0 16px;">Your prompt for the chosen task should include four parts: role, context, raw material, and output format.</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">You are helping me with [task].
Context: [who I serve, what I am trying to achieve, any important constraint].
Raw material: [paste the message, notes, product details, lesson points, or rough idea].
Output format: [reply, checklist, table, outline, script, steps].
Keep the result practical and easy to use.</pre>
        <p style="margin:0 0 16px;">Do not judge AI by one magical prompt. Judge it by whether it reduces friction in a repeated workflow. That is the foundation of practical AI building.</p>
        <p style="margin:0 0 16px;">If you run a business, read this guide after doing the exercise: <a href="${links.businessAi}" style="color:#1d4ed8;font-weight:700;">AI for Nigerian Small Business Owners: Practical Daily Use Cases</a>.</p>
        <p style="margin:0;">If you want guided practice with this kind of workflow, my <a href="${links.everydayBusiness}" style="color:#1d4ed8;font-weight:700;">AI for Everyday Business Owners</a> course was built for exactly this level of practical use.</p>
      `
    ),
  },
  {
    number: 2,
    waitDaysAfterPrevious: 7,
    name: "The prompt brief",
    subject: "Lesson 2: Stop prompting. Start briefing.",
    previewText: "A weak prompt asks. A strong brief gives context, constraints, examples, and a clear output.",
    htmlContent: lessonHtml(
      "Stop prompting. Start briefing.",
      `
        <p style="margin:0 0 16px;">The word “prompt” makes many people think AI works like a search box. Type a question. Get an answer. Move on.</p>
        <p style="margin:0 0 16px;">But when you want useful output, you should treat AI less like a search engine and more like a junior assistant. You do not just throw instructions at a junior assistant. You brief them.</p>
        <p style="margin:0 0 16px;">A strong AI brief has six parts:</p>
        <ol style="margin:0 0 16px 22px;padding:0;">
          <li><strong>Goal:</strong> what you want to achieve.</li>
          <li><strong>Audience:</strong> who the output is for.</li>
          <li><strong>Context:</strong> what the AI needs to know before answering.</li>
          <li><strong>Raw material:</strong> your rough notes, examples, questions, or data.</li>
          <li><strong>Constraints:</strong> tone, length, reading level, what to avoid.</li>
          <li><strong>Output format:</strong> table, checklist, email, lesson outline, code plan, page structure.</li>
        </ol>
        <p style="margin:0 0 16px;">Here is a practical brief you can adapt:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">Goal: Help me create a clear explanation of [topic].
Audience: [business owners / parents / students / teachers / customers].
Context: They currently struggle with [problem].
Raw material: [paste notes].
Constraints: Use simple language. Avoid hype. Be specific. Use Nigerian examples where useful.
Output format: Give me a short intro, 5 practical points, and one action step.</pre>
        <p style="margin:0 0 16px;">The quality jump comes from context and constraints. Without context, AI guesses. Without constraints, it becomes generic. Without output format, it gives you something you still need to reshape.</p>
        <p style="margin:0 0 16px;">Your assignment: take one weak prompt you used recently and rewrite it as a brief. Then ask AI to produce the answer twice: once with the weak prompt, once with the brief. Compare the results. You will see the difference immediately.</p>
        <p style="margin:0 0 16px;">For students and young builders, this skill is foundational. I explained the bigger picture here: <a href="${links.promptEngineering}" style="color:#1d4ed8;font-weight:700;">Prompt Engineering for Nigerian Students</a>.</p>
        <p style="margin:0;">If you want to learn this through building simple websites and tools, start with <a href="${links.promptToProfit}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit</a>.</p>
      `
    ),
  },
  {
    number: 3,
    waitDaysAfterPrevious: 7,
    name: "Build a reusable reply system",
    subject: "Lesson 3: Turn repeated replies into a reusable AI system",
    previewText: "If customers ask the same questions, do not keep rewriting answers from scratch.",
    htmlContent: lessonHtml(
      "Turn repeated replies into a reusable AI system",
      `
        <p style="margin:0 0 16px;">If people ask you the same questions every week, you already have the raw material for an AI system.</p>
        <p style="margin:0 0 16px;">The mistake is to ask AI to “reply this customer” every time from scratch. That gives inconsistent answers. A better approach is to build a reply bank and a reply prompt.</p>
        <p style="margin:0 0 16px;">Start with five questions customers, parents, students, or clients ask often. For each one, write your best answer manually. Do not make it perfect. Make it accurate.</p>
        <p style="margin:0 0 16px;">Then create this structure:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">You help me reply messages using my answer bank.
Rules:
- Keep the reply warm and clear.
- Do not invent policies, prices, dates, or guarantees.
- If the question is not covered by the answer bank, say what information is missing.

Answer bank:
Q1: [question]
A1: [approved answer]

Customer message:
[paste message]

Output:
1. Suggested reply
2. Any missing information I should confirm before sending</pre>
        <p style="margin:0 0 16px;">This is simple, but it changes the quality of your AI use. You are no longer hoping AI knows your business. You are giving it the approved knowledge base.</p>
        <p style="margin:0 0 16px;">For teachers, the same system works for parent communication. For schools, it works for admission enquiries. For business owners, it works for pricing, delivery, objections, complaints, and follow-ups.</p>
        <p style="margin:0 0 16px;">Your assignment: create a five-answer bank this week. Test it with three real messages. Do not send the AI output blindly. Review and improve it. The point is not to remove judgment. The point is to reduce repetitive drafting.</p>
        <p style="margin:0;">This lesson connects directly to <a href="${links.everydayBusiness}" style="color:#1d4ed8;font-weight:700;">AI for Everyday Business Owners</a>, where we work through practical business communication use cases in a structured way.</p>
      `
    ),
  },
  {
    number: 4,
    waitDaysAfterPrevious: 7,
    name: "Plan before building",
    subject: "Lesson 4: Before you build with AI, force it to plan",
    previewText: "AI can produce fast output, but fast output without structure becomes confusion.",
    htmlContent: lessonHtml(
      "Before you build with AI, force it to plan",
      `
        <p style="margin:0 0 16px;">One of the fastest ways to waste time with AI is to jump straight into production.</p>
        <p style="margin:0 0 16px;">“Build me a website.” “Write me a sales page.” “Create an app.” These instructions sound direct, but they skip the part where most projects fail: structure.</p>
        <p style="margin:0 0 16px;">Before asking AI to create anything, ask it to plan. Planning exposes assumptions, missing pieces, weak logic, and unrealistic scope.</p>
        <p style="margin:0 0 16px;">Use this planning prompt:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">I want to build [thing].
Do not create it yet.
First, help me plan it.

Ask me up to 10 important questions.
Then give me:
1. The goal of the project
2. The target user
3. The main sections or features
4. The information I need to provide
5. The smallest useful first version
6. The risks or unclear areas</pre>
        <p style="margin:0 0 16px;">That phrase “smallest useful first version” matters. Most beginners overbuild. They want payment systems, dashboards, animations, databases, user accounts, admin panels, and automation before they can clearly explain the main use case.</p>
        <p style="margin:0 0 16px;">If you are building a website, your smallest useful version may be: home page, offer explanation, proof, contact method, and one clear call to action. If you are building a dashboard, it may be: login, one table, one form, and one summary view.</p>
        <p style="margin:0 0 16px;">Your assignment: take one thing you want to build and run the planning prompt. Do not ask AI to build yet. Spend one day improving the plan. The output will be better because the thinking is clearer.</p>
        <p style="margin:0 0 16px;">If your project is a website, read this: <a href="${links.businessWebsite}" style="color:#1d4ed8;font-weight:700;">How Nigerian Small Businesses Can Build a Website With AI</a>.</p>
        <p style="margin:0;">If you want to learn this through a guided beginner project, see <a href="${links.promptToProfit}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit</a>.</p>
      `
    ),
  },
  {
    number: 5,
    waitDaysAfterPrevious: 7,
    name: "Build a lead capture page",
    subject: "Lesson 5: The simplest useful thing to build is a lead capture page",
    previewText: "A lead capture page teaches offer clarity, form design, follow-up, and conversion tracking.",
    htmlContent: lessonHtml(
      "The simplest useful thing to build is a lead capture page",
      `
        <p style="margin:0 0 16px;">If you are learning to build with AI, a lead capture page is one of the best first projects.</p>
        <p style="margin:0 0 16px;">It is small enough to finish, but serious enough to teach real skills: offer clarity, user flow, form design, copywriting, data capture, email integration, tracking, and follow-up.</p>
        <p style="margin:0 0 16px;">A useful lead capture page needs five things:</p>
        <ol style="margin:0 0 16px 22px;padding:0;">
          <li>A specific audience.</li>
          <li>A clear promise.</li>
          <li>A reason to leave details now.</li>
          <li>A short form.</li>
          <li>A follow-up system.</li>
        </ol>
        <p style="margin:0 0 16px;">Here is the planning prompt:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">Help me plan a lead capture page.
Audience: [who this is for]
Offer: [what I want them to get or request]
Why they should care: [pain, desire, or outcome]
Form fields: [name, email, phone, etc.]
After submission: [thank you message, email follow-up, WhatsApp, booking, download]

Give me:
1. Hero headline
2. Subheadline
3. Form section copy
4. Trust points
5. Thank-you message
6. Follow-up email idea</pre>
        <p style="margin:0 0 16px;">Do not ask for too many fields. Every extra field is friction. For a simple newsletter or insight series, first name and email are enough. For a service enquiry, add phone and one qualifying question.</p>
        <p style="margin:0 0 16px;">Your assignment: sketch a lead capture page for one offer. Do not worry about beauty first. Get the logic right: who is it for, what do they get, why should they care, what happens next?</p>
        <p style="margin:0;">This is the kind of practical building we cover in <a href="${links.promptToProfit}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit</a>, because it teaches AI, web structure, and real-world usefulness at the same time.</p>
      `
    ),
  },
  {
    number: 6,
    waitDaysAfterPrevious: 7,
    name: "Use AI for offers",
    subject: "Lesson 6: Use AI to sharpen your offer, not decorate your words",
    previewText: "Better writing cannot save a weak offer. Use AI to clarify the offer before writing the copy.",
    htmlContent: lessonHtml(
      "Use AI to sharpen your offer, not decorate your words",
      `
        <p style="margin:0 0 16px;">Many people use AI to make weak ideas sound polished. That is the wrong job.</p>
        <p style="margin:0 0 16px;">If the offer is unclear, AI will produce beautiful confusion. Before asking for copy, use AI to stress-test the offer.</p>
        <p style="margin:0 0 16px;">A clear offer answers four questions:</p>
        <ol style="margin:0 0 16px 22px;padding:0;">
          <li>Who exactly is this for?</li>
          <li>What problem does it solve?</li>
          <li>What outcome should the person expect?</li>
          <li>Why should they trust this path?</li>
        </ol>
        <p style="margin:0 0 16px;">Use this prompt before writing any sales page, landing page, course page, or campaign:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">Here is my offer:
[describe it]

Help me evaluate it.
Give me:
1. The clearest target audience
2. The strongest promise
3. The likely objections
4. The proof I need
5. What sounds vague
6. A sharper version of the offer in plain language</pre>
        <p style="margin:0 0 16px;">After that, ask for copy. Not before. Good copy is built on clear thinking.</p>
        <p style="margin:0 0 16px;">Your assignment: take one offer you currently describe casually. Run the prompt. Rewrite the offer in one sentence. Then test it by asking: would a stranger know whether this is for them?</p>
        <p style="margin:0;">If you teach, sell, consult, run a school, or manage a business, this is one of the highest-return AI skills you can learn. It is also why <a href="${links.everydayBusiness}" style="color:#1d4ed8;font-weight:700;">AI for Everyday Business Owners</a> focuses on thinking clearly, not just writing faster.</p>
      `
    ),
  },
  {
    number: 7,
    waitDaysAfterPrevious: 7,
    name: "Turn questions into content",
    subject: "Lesson 7: Your best content ideas are hiding in customer questions",
    previewText: "Stop guessing what to post. Mine real questions and turn them into useful content.",
    htmlContent: lessonHtml(
      "Your best content ideas are hiding in customer questions",
      `
        <p style="margin:0 0 16px;">The easiest way to create useful content is to stop inventing topics and start listening to questions.</p>
        <p style="margin:0 0 16px;">Every question from a customer, parent, student, staff member, or prospect reveals a gap. That gap can become an email, post, FAQ, video, landing page section, or lesson.</p>
        <p style="margin:0 0 16px;">Collect ten real questions. Paste them into AI and use this prompt:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">These are real questions people ask me:
[paste questions]

Group them into themes.
For each theme, give me:
1. The underlying concern
2. A useful content title
3. The key points I should explain
4. The best format: email, blog post, short video, FAQ, or landing page section</pre>
        <p style="margin:0 0 16px;">This works because real questions carry demand. If one person asked, others are probably wondering silently.</p>
        <p style="margin:0 0 16px;">Do not use AI to produce shallow answers. Use it to organize the questions, find patterns, and create a useful outline. Then add your experience, examples, and judgment.</p>
        <p style="margin:0 0 16px;">Your assignment: create one piece of content from a real question this week. Keep it useful. Answer the question directly. Include a simple next step.</p>
        <p style="margin:0;">If your audience includes students or schools, this article shows how practical AI topics can become a curriculum: <a href="${links.curriculum}" style="color:#1d4ed8;font-weight:700;">AI Curriculum for Nigerian Schools</a>.</p>
      `
    ),
  },
  {
    number: 8,
    waitDaysAfterPrevious: 7,
    name: "From spreadsheet to dashboard",
    subject: "Lesson 8: A dashboard starts as a better question, not code",
    previewText: "Before building a dashboard, decide what decision it should help you make.",
    htmlContent: lessonHtml(
      "A dashboard starts as a better question, not code",
      `
        <p style="margin:0 0 16px;">Many people think a dashboard begins with code. It does not. It begins with a decision.</p>
        <p style="margin:0 0 16px;">A useful dashboard should help someone answer a question quickly: Which students need attention? Which leads are converting? Which orders are delayed? Which campaigns are working? Which payments need review?</p>
        <p style="margin:0 0 16px;">If the decision is unclear, the dashboard becomes a decorated spreadsheet.</p>
        <p style="margin:0 0 16px;">Use this prompt before building any dashboard:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">I want to build a dashboard for [process].
Help me define it.

Give me:
1. The main user
2. The top 5 decisions they need to make
3. The data needed for each decision
4. The best summary cards
5. The best table columns
6. Filters that matter
7. Actions the user should be able to take</pre>
        <p style="margin:0 0 16px;">Then build the smallest version: summary cards, one table, one filter, one action. You can expand later.</p>
        <p style="margin:0 0 16px;">This is the bridge between casual AI use and real building. You move from “write this for me” to “help me design a working system.”</p>
        <p style="margin:0 0 16px;">Your assignment: choose one messy process you currently track in your head, notebook, WhatsApp, or spreadsheet. Define the dashboard question. Then ask AI for the table columns and summary cards.</p>
        <p style="margin:0;">If you want to move beyond simple pages into real applications and dashboards, <a href="${links.promptToProduction}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit Advanced</a> is the course built for that next level.</p>
      `
    ),
  },
  {
    number: 9,
    waitDaysAfterPrevious: 7,
    name: "Verify AI output",
    subject: "Lesson 9: Never trust AI output you cannot check",
    previewText: "The practical builder’s rule: AI can assist, but your judgment must approve.",
    htmlContent: lessonHtml(
      "Never trust AI output you cannot check",
      `
        <p style="margin:0 0 16px;">AI can be useful and wrong at the same time. That is why practical builders need a verification habit.</p>
        <p style="margin:0 0 16px;">The rule is simple: do not use AI output in an area where you cannot check the result or get it checked.</p>
        <p style="margin:0 0 16px;">For writing, check accuracy, tone, promises, and missing context. For business advice, check whether it fits your market. For code, test the actual behavior. For school work, check whether the learner understands the answer. For content, check facts and examples.</p>
        <p style="margin:0 0 16px;">Use this review prompt after AI gives you output:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">Review the output you just gave me.
List:
1. Claims that need fact-checking
2. Assumptions you made
3. Possible missing context
4. Parts that sound too generic
5. Questions I should answer to improve this
6. A safer revised version</pre>
        <p style="margin:0 0 16px;">For code or technical builds, ask for tests. For business writing, ask for objections. For school material, ask for age-appropriateness and misconceptions.</p>
        <p style="margin:0 0 16px;">Your assignment: take one AI output you planned to use. Run the review prompt. Improve the output before using it. This is how you build trust in your workflow without becoming careless.</p>
        <p style="margin:0;">This verification habit is important for children and students too. If you are a parent or school owner, read <a href="${links.studentWebsites}" style="color:#1d4ed8;font-weight:700;">How Nigerian Students Can Build Websites With ChatGPT Without Coding</a> and notice the emphasis on understanding what was built.</p>
      `
    ),
  },
  {
    number: 10,
    waitDaysAfterPrevious: 7,
    name: "Build a workflow",
    subject: "Lesson 10: Your first automation should be boring",
    previewText: "The best first automation is not flashy. It removes one repeated handoff.",
    htmlContent: lessonHtml(
      "Your first automation should be boring",
      `
        <p style="margin:0 0 16px;">People often imagine automation as something complex: many tools, many branches, many triggers. That is not where to start.</p>
        <p style="margin:0 0 16px;">Your first automation should be boring. It should remove one repeated handoff.</p>
        <p style="margin:0 0 16px;">Examples:</p>
        <ul style="margin:0 0 16px 22px;padding:0;">
          <li>Someone fills a form, and their details enter your email list.</li>
          <li>A lead submits a request, and you receive a structured notification.</li>
          <li>A student completes a form, and their dashboard record is created.</li>
          <li>A payment is confirmed, and the learner gets the right access.</li>
        </ul>
        <p style="margin:0 0 16px;">The automation map is simple:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">Trigger: What starts the workflow?
Data: What information is collected?
Decision: Is anything checked or filtered?
Action: What should happen automatically?
Fallback: What happens if the automation fails?
Owner: Who reviews exceptions?</pre>
        <p style="margin:0 0 16px;">The fallback matters. Serious systems do not assume everything works. They log failures, show clear errors, and give someone a way to fix the issue.</p>
        <p style="margin:0 0 16px;">Your assignment: choose one repeated handoff in your work and map it using the five lines above. Do not automate it yet. First make the workflow clear enough that someone else can understand it.</p>
        <p style="margin:0;">This is the kind of thinking that separates casual AI use from real systems building. If you are ready for that level, look at <a href="${links.promptToProduction}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit Advanced</a>.</p>
      `
    ),
  },
  {
    number: 11,
    waitDaysAfterPrevious: 7,
    name: "Package an AI skill",
    subject: "Lesson 11: Package one AI skill into a service people can understand",
    previewText: "A skill becomes valuable when it is tied to a clear outcome someone already wants.",
    htmlContent: lessonHtml(
      "Package one AI skill into a service people can understand",
      `
        <p style="margin:0 0 16px;">Learning AI is useful. Packaging an AI skill into a clear service is where value becomes visible.</p>
        <p style="margin:0 0 16px;">Do not sell “AI services.” That is too vague. Sell a concrete outcome.</p>
        <p style="margin:0 0 16px;">Examples:</p>
        <ul style="margin:0 0 16px 22px;padding:0;">
          <li>I help small businesses create a clean one-page website from their rough notes.</li>
          <li>I help schools create a simple AI club launch plan.</li>
          <li>I help business owners turn repeated customer questions into a reply bank.</li>
          <li>I help job seekers build a small portfolio project they can show employers.</li>
        </ul>
        <p style="margin:0 0 16px;">Use this packaging prompt:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">I have this AI-assisted skill: [describe skill].
Help me package it into a simple service.
Give me:
1. The best target audience
2. The problem they already know they have
3. The outcome I can deliver
4. What I need from the client
5. What I will deliver
6. A simple offer statement
7. A delivery checklist</pre>
        <p style="margin:0 0 16px;">The service should be easy to explain. If you need ten minutes to explain it, the offer is not clear yet.</p>
        <p style="margin:0 0 16px;">Your assignment: package one AI-assisted skill into one clear offer. Write the offer in one sentence. Then list exactly what the client gets.</p>
        <p style="margin:0;">If you are a job seeker, this thinking connects with <a href="${links.promptToProfit}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit</a>: build proof, not just claims. If you want deeper application-building ability, move toward <a href="${links.promptToProduction}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit Advanced</a>.</p>
      `
    ),
  },
  {
    number: 12,
    waitDaysAfterPrevious: 7,
    name: "Your 7-day build plan",
    subject: "Lesson 12: Your 7-day practical AI building plan",
    previewText: "A simple plan to turn this series into one finished useful project.",
    htmlContent: lessonHtml(
      "Your 7-day practical AI building plan",
      `
        <p style="margin:0 0 16px;">If you have followed this series, you now have the core pattern: choose a real task, brief AI properly, plan before building, verify output, and package the result around a useful outcome.</p>
        <p style="margin:0 0 16px;">Now finish one project.</p>
        <p style="margin:0 0 16px;">Here is a 7-day plan:</p>
        <ol style="margin:0 0 16px 22px;padding:0;">
          <li><strong>Day 1:</strong> Choose one project. Keep it small: lead page, reply bank, content system, simple website, dashboard plan, or offer page.</li>
          <li><strong>Day 2:</strong> Write the project brief: goal, audience, context, constraints, output.</li>
          <li><strong>Day 3:</strong> Ask AI to plan the smallest useful version. Remove anything unnecessary.</li>
          <li><strong>Day 4:</strong> Build or draft the first version.</li>
          <li><strong>Day 5:</strong> Test it. Check clarity, errors, missing parts, and user flow.</li>
          <li><strong>Day 6:</strong> Improve it based on the test.</li>
          <li><strong>Day 7:</strong> Share it with one real person and ask for feedback.</li>
        </ol>
        <p style="margin:0 0 16px;">The goal is not to become “an AI expert” in seven days. The goal is to finish one useful thing. Completed projects teach more than endless tool tutorials.</p>
        <p style="margin:0 0 16px;">Use this final prompt:</p>
        <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 18px;font-size:14px;line-height:1.55;">Act as my project coach.
My project is: [describe it]
My audience is: [describe them]
The outcome is: [describe result]

Create a 7-day execution checklist.
For each day, give me:
1. The task
2. The AI prompt to use
3. What I should personally review
4. The output I must finish before moving on</pre>
        <p style="margin:0 0 16px;">If you want a guided path, start here: <a href="${links.courses}" style="color:#1d4ed8;font-weight:700;">explore the practical AI courses</a>. Start with <a href="${links.promptToProfit}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit</a> if you are new. Move to <a href="${links.promptToProduction}" style="color:#1d4ed8;font-weight:700;">Prompt to Profit Advanced</a> when you are ready to build more complete systems.</p>
        <p style="margin:0;">Do not wait until you understand everything. Pick one useful thing and build.</p>
      `
    ),
  },
];

module.exports = {
  seriesName: "Practical AI Building Lessons",
  defaultListId: 17,
  cadence: "weekly",
  lessons: lessons.map((lesson) => Object.assign({}, lesson, {
    textContent: stripHtml(lesson.htmlContent),
  })),
};
