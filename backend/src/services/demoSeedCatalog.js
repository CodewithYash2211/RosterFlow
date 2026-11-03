const allDays=[0,1,2,3,4,5,6]
const mondayToSaturday=[1,2,3,4,5,6]
const weekdays=[1,2,3,4,5]

export const demoSeedCatalog={
 version:'northstar-six-employees-v1',
 brands:[
  {key:'nike',name:'Nike',code:'NIKE',description:'Athletic apparel customer operations.',workingDays:allDays},
  {key:'adidas',name:'Adidas',code:'ADIDAS',description:'Sportswear retention operations.',workingDays:mondayToSaturday},
  {key:'puma',name:'Puma',code:'PUMA',description:'Footwear and delivery support operations.',workingDays:allDays},
  {key:'zara',name:'Zara',code:'ZARA',description:'Fashion ecommerce operations.',workingDays:weekdays},
 ],
 processes:[
  {key:'nike-customer-support',brandKey:'nike',name:'Customer Support',minimumStaffing:3,requiredSkills:['Customer Support'],workingDays:allDays,crossTrainingEligibility:['Customer Support']},
  {key:'nike-returns',brandKey:'nike',name:'Returns',minimumStaffing:1,requiredSkills:['Returns'],workingDays:allDays,crossTrainingEligibility:['Returns']},
  {key:'adidas-retention',brandKey:'adidas',name:'Retention',minimumStaffing:2,requiredSkills:['Retention'],workingDays:mondayToSaturday,crossTrainingEligibility:['Retention']},
  {key:'adidas-customer-support',brandKey:'adidas',name:'Customer Support',minimumStaffing:1,requiredSkills:['Customer Support'],workingDays:mondayToSaturday,crossTrainingEligibility:['Customer Support']},
  {key:'puma-ndr',brandKey:'puma',name:'NDR Operations',minimumStaffing:2,requiredSkills:['NDR Operations'],workingDays:allDays,crossTrainingEligibility:['NDR Operations']},
  {key:'puma-retention',brandKey:'puma',name:'Retention',minimumStaffing:1,requiredSkills:['Retention'],workingDays:allDays,crossTrainingEligibility:['Retention']},
  {key:'zara-abandoned-cart',brandKey:'zara',name:'Abandoned Cart',minimumStaffing:1,requiredSkills:['Abandoned Cart'],workingDays:weekdays,crossTrainingEligibility:['Abandoned Cart']},
 ],
 employees:[
  {employeeCode:'RF-1042',name:'Aarav Mehta',email:'aarav@northstar.example',role:'Customer Support',brandKey:'nike',processKeys:['nike-customer-support'],podKey:'alpha',weeklyOff:6,skills:['Customer Support','Customer Service','Email Support'],crossTrainingSkills:['Returns'],crossTrainedFor:['Returns']},
  {employeeCode:'RF-1043',name:'Isha Shah',email:'isha@northstar.example',role:'Retention',brandKey:'adidas',processKeys:['adidas-retention'],podKey:'beta',weeklyOff:2,skills:['Retention','Customer Service','Loyalty Programs'],crossTrainingSkills:['Customer Support'],crossTrainedFor:['Customer Support']},
  {employeeCode:'RF-1044',name:'Kabir Rao',email:'kabir@northstar.example',role:'NDR Operations',brandKey:'puma',processKeys:['puma-ndr'],podKey:'alpha',weeklyOff:0,skills:['NDR Operations','Logistics','Delivery Resolution'],crossTrainingSkills:['Customer Support'],crossTrainedFor:['Customer Support']},
  {employeeCode:'RF-1045',name:'Ananya Das',email:'ananya@northstar.example',role:'Abandoned Cart',brandKey:'zara',processKeys:['zara-abandoned-cart'],podKey:'gamma',weeklyOff:4,skills:['Abandoned Cart','Ecommerce','Customer Follow-up'],crossTrainingSkills:['Customer Support'],crossTrainedFor:['Customer Support']},
  {employeeCode:'RF-1046',name:'Rohan Kulkarni',email:'rohan@northstar.example',role:'Customer Support',brandKey:'nike',processKeys:['nike-customer-support'],podKey:'beta',weeklyOff:1,skills:['Customer Support','Customer Service','Email Support'],crossTrainingSkills:['Returns'],crossTrainedFor:['Returns']},
  {employeeCode:'RF-1047',name:'Meera Nair',email:'meera@northstar.example',role:'Retention',brandKey:'puma',processKeys:['puma-retention'],podKey:'gamma',weeklyOff:5,skills:['Retention','Customer Service','Loyalty Programs'],crossTrainingSkills:['NDR Operations'],crossTrainedFor:['NDR Operations']},
 ],
 pods:[
  {key:'alpha',name:'Pod Alpha',code:'POD-ALPHA',description:'Customer support and delivery resolution team.',leaderCode:'RF-1042',memberCodes:['RF-1042','RF-1044'],brandKeys:['nike','puma'],processKeys:['nike-customer-support','nike-returns','puma-ndr'],capacity:8},
  {key:'beta',name:'Pod Beta',code:'POD-BETA',description:'Retention and customer support team.',leaderCode:'RF-1043',memberCodes:['RF-1043','RF-1046'],brandKeys:['adidas','nike'],processKeys:['adidas-retention','adidas-customer-support','nike-customer-support'],capacity:8},
  {key:'gamma',name:'Pod Gamma',code:'POD-GAMMA',description:'Ecommerce and customer retention team.',leaderCode:'RF-1047',memberCodes:['RF-1045','RF-1047'],brandKeys:['puma','zara'],processKeys:['puma-ndr','puma-retention','zara-abandoned-cart'],capacity:8},
 ],
}
