export type SegmentKey = 'sleeping' | 'loyal' | 'first_visit';

export function segmentCampaignDraft(segmentKey: SegmentKey): { title: string; message: string } {
  switch (segmentKey) {
    case 'sleeping':
      return {
        title: 'Uykuda — nazik hatırlatma',
        message:
          'Sizi özledik. Bu hafta gelen misafirlerimize özel küçük bir sürpriz hazırladık; QR ile haber verin, yer ayıralım.',
      };
    case 'loyal':
      return {
        title: 'Sadık misafir — teşekkür + mikro ödül',
        message:
          'Sık gelişiniz not edildi. Bir sonraki ziyaretinizde ikramımız hazır; kodu kasada gösterin.',
      };
    case 'first_visit':
      return {
        title: 'İlk kez — tanışma paketi',
        message:
          'Hoş geldiniz! İlk deneyiminizi güçlendirmek için bugün geçerli küçük bir indirim rezerve ettik.',
      };
    default:
      return { title: 'Kampanya', message: 'Özel bir teklif hazırladık.' };
  }
}
