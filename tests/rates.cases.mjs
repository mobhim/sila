/* Questions about money that the written rules must recognise by themselves, so that no model is ever asked for a price.
   RATES: tonight's room rates. BILL: the guest's own bill. NOT: messages that must not be read as either. */
export const RATES = [
  'كم الليلة عندكم؟', 'kam se3r el leila', 'كم سعرر الليله',                 // the three that reached a model in the first evaluation
  'بكم الليلة؟', 'الليلة بكم؟', 'كم سعر الغرفة', 'وش أسعاركم', 'كم الجناح عندكم', 'كم تكلف الليلة', 'كم الغرفة الليلة؟', 'ابي اعرف الاسعار',
  'كم حق الليلة', 'السعر كم؟', 'كم سعر الليله الوحده', 'بكككم الليلة', 'اسعااار الغرف', 'كم تاخذون على الليلة',
  'bkam el leila', 'kam el ghorfa', 'el se3r kam', 'as3ar el leila', 'be kam el layla', 'kam layla 3endkom',
  'How much is a night?', 'what are your rates', 'room prices please', 'how mutch per night', 'hw much is the room', 'nightly rate?', 'whats the prise',
  'price for tonight', 'cost of a suite', 'how much does a room cost'
];
export const BILL = [
  'كم فاتورتي؟', 'كم علي', 'وش صار علي', 'كم حسابي', 'كم المبلغ المطلوب', 'ابي اعرف فاتورتي', 'كم باقي علي', 'الفاتوره كم', 'كم الإجمالي', 'كم راح أدفع',
  'kam fatorti', 'kam 3alaya', '7sabi kam', 'el fatoora kam',
  'What is my bill?', 'how much do I owe', 'my total please', 'show me my bil', 'what do i owe', 'how much will i pay', 'my invoice'
];
export const NOT = [
  'المكيف خربان', 'أبي مناشف زيادة', 'شكراً جزيلاً', 'متى موعد المغادرة؟', 'انقلني لغرفة ثانية', 'the AC is broken', 'thanks a lot', 'I need towels',
  'when is check-out?', 'is my room ready', 'الغرفة حر مرة', 'el mokayef 5arban', 'how much time until checkout'
];
